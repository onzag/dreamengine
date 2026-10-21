/**
 * Initialize a new world using setup attributes supplied by app-play.
 * Kept apart from the game controller and scene-selection presentation.
 * @param {HTMLElement} game
 */
export async function initializeNewGame(game) {
    const partyCharacters = JSON.parse(game.getAttribute('party-characters') || '[]');
    const isSelfInsert = game.getAttribute('is-self-insert') === 'true';
    await window.ENGINE_WORKER_CLIENT.jsEngineClearExecutionOrder();
    await window.ENGINE_WORKER_CLIENT.jsEngineImportScript({
        namespace: game.getAttribute('world-namespace') || '',
        id: game.getAttribute('world-id') || '',
    });

    const importedPartyScripts = new Set();
    for (const partyMember of partyCharacters) {
        const scriptKey = `${partyMember.namespace}/${partyMember.id}`;
        if (importedPartyScripts.has(scriptKey)) continue;
        importedPartyScripts.add(scriptKey);
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

    // Only selected exposed characters join the party, even when their script adds others.
    const engineScriptInfo = await window.ENGINE_WORKER_CLIENT.getEngineScriptInfo();
    if (partyCharacters.length > 0) {
        const characters = Object.values(await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ['characters'] }));
        for (const partyMember of partyCharacters) {
            const character = characters.find(c => c.scriptGivenId === partyMember.scriptGivenId);
            if (!partyMember.scriptGivenId || !character) {
                throw new Error(`Selected party character ${partyMember.scriptGivenId || '(missing scriptGivenId)'} was not created.`);
            }
            await window.ENGINE_WORKER_CLIENT.addCharacterToParty({ charId: character.id });
        }
    }

    // check if we are taking a character's identity (i.e. not a self-insert but sharing a name with an existing character), and if so, assume that identity to get the correct starting location and inventory
    const characterName = game.getAttribute('character-name') || '';

    if (!isSelfInsert && characterName) {
        if (characterName.startsWith('script://')) {
            const [namespace, id] = characterName.substring('script://'.length).split('/');
            const potentialChars = engineScriptInfo.charactersAdded.filter(c => c.scriptNamespace === namespace && c.scriptId === id);
            if (potentialChars.length !== 1) {
                throw new Error(`The character selected in Play must resolve to one character; script ${namespace}/${id} added ${potentialChars.length}.`);
            }
            await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentity({ charId: potentialChars[0].charId });
        } else {
            const characters = await window.ENGINE_WORKER_CLIENT.queryDEObject({ path: ["characters"] });
            const scriptKey = game.getAttribute('character-script-key') || '';
            const character = Object.values(characters).find(c =>
                c.name === characterName && c.script === scriptKey
            );
            if (!character) throw new Error(`Character ${characterName} from script ${scriptKey} not found.`);
            await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentity({ charId: character.id });
        }
    }
}
