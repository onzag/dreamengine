/**
 * Initialize a new world using setup attributes supplied by app-play.
 * Kept apart from the game controller and scene-selection presentation.
 * @param {HTMLElement} game
 * @param {(options: Array<{name: string, description: string, assetImage: string}>) => Promise<string>} selectCharacter
 */
export async function initializeNewGame(game, selectCharacter) {
    const partyCharacters = JSON.parse(game.getAttribute('party-characters') || '[]');
    const isSelfInsert = game.getAttribute('is-self-insert') === 'true';
    await window.ENGINE_WORKER_CLIENT.jsEngineClearExecutionOrder();
    await window.ENGINE_WORKER_CLIENT.jsEngineImportScript({
        namespace: game.getAttribute('world-namespace') || '',
        id: game.getAttribute('world-id') || '',
    });

    for (const partyMember of partyCharacters) {
        await window.ENGINE_WORKER_CLIENT.jsEngineImportScript({
            namespace: partyMember.namespace,
            id: partyMember.id,
        });
    }

    const specialMode = game.getAttribute('special-mode') || '';
    /** @type {"player" | "narrator" | "voice-in-the-head"} */
    const playMode = specialMode === 'narrator'
        ? 'narrator'
        : specialMode === 'schizophrenia'
            ? 'voice-in-the-head'
            : 'player';

    /** @type {DEMinimalCharacterReference | null} */
    let user = null;
    if (isSelfInsert) {
        // Pull every DEMinimalCharacterReference field from the user
        // config. When picking an existing character we leave `user`
        // null and let the engine assume that character's identity
        // afterwards.
        const cfg = window.API.getConfigValue;
        const [
            name, sex, gender,
            heightCm, weightKg, ageYears,
            carryingCapacityLiters, carryingCapacityKg,
            maintenanceCaloriesPerDay, maintenanceHydrationLitersPerDay,
            rangeMeters, locomotionSpeedMetersPerSecond,
            shortDescription, shortDescriptionTopNakedAdd, shortDescriptionBottomNakedAdd,
            stealth, perception, attractiveness, charisma,
            tier, tierValue, apparentTier, apparentTierValue, powerGrowthRate,
            species, speciesType, race, groupBelonging, initialClothing, initialClothingFitment
        ] = await Promise.all([
            cfg('user.name'), cfg('user.sex'), cfg('user.gender'),
            cfg('user.heightCm'), cfg('user.weightKg'), cfg('user.ageYears'),
            cfg('user.carryingCapacityLiters'), cfg('user.carryingCapacityKg'),
            cfg('user.maintenanceCaloriesPerDay'), cfg('user.maintenanceHydrationLitersPerDay'),
            cfg('user.rangeMeters'), cfg('user.locomotionSpeedMetersPerSecond'),
            cfg('user.shortDescription'), cfg('user.shortDescriptionTopNakedAdd'), cfg('user.shortDescriptionBottomNakedAdd'),
            cfg('user.stealth'), cfg('user.perception'), cfg('user.attractiveness'), cfg('user.charisma'),
            cfg('user.tier'), cfg('user.tierValue'), cfg('user.apparentTier'), cfg('user.apparentTierValue'), cfg('user.powerGrowthRate'),
            cfg('user.species'), cfg('user.speciesType'), cfg('user.race'), cfg('user.groupBelonging'), cfg('user.initialClothing'), cfg('user.initialClothingFitment')
        ]);

        const actualInitialClothing = initialClothing || "auto";
        const actualInitialClothingFitment = initialClothingFitment || "normal";

        user = {
            id: "character0",
            script: "",
            scriptGivenId: "",
            unknownName: (species || 'human') ? "Stranger" : "Unknown Creature",
            name,
            metadata: {
                assets: {
                    neutral: "profile",
                },
            },
            clothing: actualInitialClothing !== "auto" ? "custom" : (actualInitialClothingFitment === "tight" ? "auto-tight" : (actualInitialClothingFitment === "loose" ? "auto-loose" : "auto")),
            sex: sex || "male",
            gender: gender || sex || "male",
            heightCm: typeof heightCm === "number" ? Number(heightCm) : 175,
            weightKg: typeof weightKg === "number" ? Number(weightKg) : 70,
            ageYears: typeof ageYears === "number" ? Number(ageYears) : 25,
            carryingCapacityLiters: typeof carryingCapacityLiters === "number" ? Number(carryingCapacityLiters) : 50,
            carryingCapacityKg: typeof carryingCapacityKg === "number" ? Number(carryingCapacityKg) : 50,
            maintenanceCaloriesPerDay: typeof maintenanceCaloriesPerDay === "number" ? Number(maintenanceCaloriesPerDay) : 2000,
            maintenanceHydrationLitersPerDay: typeof maintenanceHydrationLitersPerDay === "number" ? Number(maintenanceHydrationLitersPerDay) : 2,
            rangeMeters: typeof rangeMeters === "number" ? Number(rangeMeters) : 10000,
            locomotionSpeedMetersPerSecond: typeof locomotionSpeedMetersPerSecond === "number" ? Number(locomotionSpeedMetersPerSecond) : 1.4,
            shortDescription: shortDescription || '',
            shortDescriptionTopNakedAdd: shortDescriptionTopNakedAdd || null,
            shortDescriptionBottomNakedAdd: shortDescriptionBottomNakedAdd || null,
            stealth: typeof stealth === "number" ? Number(stealth) : 0.5,
            perception: typeof perception === "number" ? Number(perception) : 0.5,
            attractiveness: typeof attractiveness === "number" ? Number(attractiveness) : 0.5,
            charisma: typeof charisma === "number" ? Number(charisma) : 0.5,
            tier: tier || "human",
            tierValue: typeof tierValue === "undefined" ? 50 : Number(tierValue),
            apparentTier: apparentTier || "human",
            apparentTierValue: typeof apparentTierValue === "undefined" ? 50 : Number(apparentTierValue),
            powerGrowthRate: typeof powerGrowthRate === "undefined" ? 0.25 : Number(powerGrowthRate),
            species: species || 'human',
            speciesType: speciesType || 'humanoid',
            race: race || null,
            groupBelonging: groupBelonging || [],
        };

    }

    await window.ENGINE_WORKER_CLIENT.initialize({ user, playMode });

    const dreamStability = game.getAttribute('dream-stability') || 'stable';
    await window.ENGINE_WORKER_CLIENT.setDreamStability({ stability: dreamStability === "stable" ? 1 : (dreamStability === "unstable" ? 0.99 : 0.95) });

    const defaultNarratorVoice = game.getAttribute('default-narrator-voice') || '';
    const defaultNarratorVoiceOverride = (game.getAttribute('default-narrator-voice-override') || 'false') === 'true';
    const defaultNarratorVoiceTranscript = game.getAttribute('default-narrator-voice-transcript') || '';
    const defaultNarratorVoiceTags = JSON.parse(game.getAttribute('default-narrator-voice-tags') || '[]');
    if (defaultNarratorVoiceOverride && defaultNarratorVoice) {
        await window.ENGINE_WORKER_CLIENT.forceSetDEObject({
            path: ["state", "__INTERNAL_NARRATOR_OVERRIDE"],
            value: {
                asset: defaultNarratorVoice,
                transcript: defaultNarratorVoiceTranscript,
                tags: defaultNarratorVoiceTags,
            },
        });
    } else if (defaultNarratorVoice) {
        await window.ENGINE_WORKER_CLIENT.forceSetDEObject({
            path: ["state", "__INTERNAL_NARRATOR"],
            value: {
                asset: defaultNarratorVoice,
                transcript: defaultNarratorVoiceTranscript,
                tags: defaultNarratorVoiceTags,
            },
        });
    }

    // adding characters that were added by those scripts as the party members, the reason is that
    // a script can add many characters and not just one, so they all need to be added by name
    // everything is dynamic so we don't necessarily know by the namespace and id
    const engineScriptInfo = await window.ENGINE_WORKER_CLIENT.getEngineScriptInfo();
    for (const partyMember of partyCharacters) {
        for (const charInfo of engineScriptInfo.charactersAdded) {
            if (charInfo.byId === partyMember.id && charInfo.byNamespace === partyMember.namespace) {
                await window.ENGINE_WORKER_CLIENT.addCharacterToParty({ characterName: charInfo.name });
            }
        }
    }

    // check if we are taking a character's identity (i.e. not a self-insert but sharing a name with an existing character), and if so, assume that identity to get the correct starting location and inventory
    const characterName = game.getAttribute('character-name') || '';

    if (!isSelfInsert && characterName) {
        if (characterName.startsWith('script://')) {
            const [namespace, id] = characterName.substring('script://'.length).split('/');
            const potentialChars = engineScriptInfo.charactersAdded.filter(c => c.byNamespace === namespace && c.byId === id);
            if (potentialChars.length === 0) {
                throw new Error(`Character with script key ${namespace + "/" + id} did not add any characters to the world.`);
            } else if (potentialChars.length === 1) {
                const charInfo = potentialChars[0];
                if (charInfo) {
                    await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentity({ characterName: charInfo.name });
                } else {
                    throw new Error(`Character with script key ${namespace + "/" + id} not found among characters added by the world and party scripts.` + JSON.stringify(engineScriptInfo.charactersAdded));
                }
            } else {
                // The script added several characters. Let the player
                // pick which one to assume the identity of, showing a
                // portrait and short description for each (same
                // mechanism used for the user's own sidebar info).
                /** @type {Array<{ name: string, description: string, assetImage: string }>} */
                const characterOptions = [];
                for (const charInfo of potentialChars) {
                    // eslint-disable-next-line no-await-in-loop
                    const description = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                        path: ["utils", "getExternalDescriptionOfCharacter"],
                        call: [{ char: charInfo.name }, true, false],
                    });
                    // eslint-disable-next-line no-await-in-loop
                    const assetImage = await window.ENGINE_WORKER_CLIENT.queryDEObject({
                        path: ["characters", charInfo.name, "metadata", "assets", "neutral"],
                    }) || "";
                    characterOptions.push({
                        name: charInfo.name,
                        description: typeof description === 'string' ? description : '',
                        assetImage,
                    });
                }

                // Show the picker only once the dream is being revealed,
                // otherwise the white "falling asleep" overlay would sit
                // on top of it.


                const chosenCharacterName = await selectCharacter(characterOptions);
                await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentity({ characterName: chosenCharacterName });

                // Keep the host attribute in sync so the rest of the UI
                // (sidebar title, input placeholder, etc.) reflects the
                // chosen character.
                game.setAttribute('character-name', chosenCharacterName);
            }
        } else {
            await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentity({ characterName });
        }
    }
}
