/** Restore the saved engine state, including its script order and player settings.
 * @param {HTMLElement} game
 */
export async function initializeSavedGame(game) {
    await window.ENGINE_WORKER_CLIENT.jsEngineClearExecutionOrder();
    await window.ENGINE_WORKER_CLIENT.initializeFromStoredState({
        loadId: [game.getAttribute('world-namespace'), game.getAttribute('world-id'), game.getAttribute('save-id')].join('/'),
    });
}

/**
 * Initialize a new world using setup attributes supplied by app-play.
 * Kept apart from the game controller and scene-selection presentation.
 * @param {HTMLElement} game
 */
export async function initializeNewGame(game) {
    /** @type {string[]} */
    const partyCharacters = JSON.parse(game.getAttribute('party-characters') || '[]');
    const isSelfInsert = game.getAttribute('is-self-insert') === 'true';
    await window.ENGINE_WORKER_CLIENT.jsEngineClearExecutionOrder();
    await window.ENGINE_WORKER_CLIENT.jsEngineImportScript({
        namespace: game.getAttribute('world-namespace') || '',
        id: game.getAttribute('world-id') || '',
    });

    if (partyCharacters.length > 0) {
        const infoMap = await window.ENGINE_WORKER_CLIENT.jsEngineGetInfoMap();
        const selectedIds = new Set(partyCharacters);
        /** @type {Map<string, {namespace: string, id: string}>} */
        const sources = new Map();
        for (const info of Object.values(infoMap)) {
            if (info.type !== 'characters') continue;
            for (const exposed of Object.values(info.exposeCharacters || {})) {
                if (selectedIds.has(exposed.scriptGivenId) && !sources.has(exposed.scriptGivenId)) {
                    sources.set(exposed.scriptGivenId, { namespace: info.namespace, id: info.id });
                }
            }
        }
        const imported = new Set([game.getAttribute('world-namespace') + '/' + game.getAttribute('world-id')]);
        for (const scriptGivenId of selectedIds) {
            const source = sources.get(scriptGivenId);
            if (!source) throw new Error('Selected party character ' + scriptGivenId + ' is not exposed.');
            const key = source.namespace + '/' + source.id;
            if (imported.has(key)) continue;
            imported.add(key);
            await window.ENGINE_WORKER_CLIENT.jsEngineImportScript(source);
        }
    }

    const specialMode = game.getAttribute('special-mode') || '';
    /** @type {"player" | "narrator" | "voice-in-the-head"} */
    const playMode = game.getAttribute('play-mode') === 'narrator' || specialMode === 'narrator'
        ? 'narrator'
        : game.getAttribute('play-mode') === 'voice-in-the-head' || specialMode === 'schizophrenia'
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
            species, speciesType, race, groupBelonging, initialClothing, initialClothingFitment,
            blindness
        ] = await Promise.all([
            cfg('user.name'), cfg('user.sex'), cfg('user.gender'),
            cfg('user.heightCm'), cfg('user.weightKg'), cfg('user.ageYears'),
            cfg('user.carryingCapacityLiters'), cfg('user.carryingCapacityKg'),
            cfg('user.maintenanceCaloriesPerDay'), cfg('user.maintenanceHydrationLitersPerDay'),
            cfg('user.rangeMeters'), cfg('user.locomotionSpeedMetersPerSecond'),
            cfg('user.shortDescription'), cfg('user.shortDescriptionTopNakedAdd'), cfg('user.shortDescriptionBottomNakedAdd'),
            cfg('user.stealth'), cfg('user.perception'), cfg('user.attractiveness'), cfg('user.charisma'),
            cfg('user.tier'), cfg('user.tierValue'), cfg('user.apparentTier'), cfg('user.apparentTierValue'), cfg('user.powerGrowthRate'),
            cfg('user.species'), cfg('user.speciesType'), cfg('user.race'), cfg('user.groupBelonging'), cfg('user.initialClothing'), cfg('user.initialClothingFitment'),
            cfg('user.blindness')
        ]);

        const actualInitialClothing = initialClothing || "auto";
        const actualInitialClothingFitment = initialClothingFitment || "normal";

        user = {
            id: "character0",
            script: "",
            scriptGivenId: "",
            unknownName: (species || 'human') ? "Stranger" : "Unknown Creature",
            name: game.getAttribute('character-name') || name || 'Unnamed Dreamer',
            metadata: {
                assets: {
                    neutral: game.getAttribute('character-asset') || 'profile',
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
            blindness: blindness || "no",
        };

    }

    await window.ENGINE_WORKER_CLIENT.initialize({ user, playMode });

    const dreamStability = game.getAttribute('dream-stability') || 'stable';
    await window.ENGINE_WORKER_CLIENT.setDreamStability({ stability: dreamStability === "stable" ? 1 : (dreamStability === "unstable" ? 0.99 : 0.95) });

    // Absence keeps every narrator setting supplied by the world untouched.
    if (game.hasAttribute('narrator-voice')) {
        await window.ENGINE_WORKER_CLIENT.forceSetDEObject({
            path: ['state', '__INTERNAL_NARRATOR_OVERRIDE'],
            value: { asset: game.getAttribute('narrator-voice') },
        });
    }

    // Only selected exposed characters join the party, even when their script adds others.
    const scriptGivenId = game.getAttribute('character-script-given-id') || '';
    if (partyCharacters.length > 0) {
        for (const partyId of new Set(partyCharacters)) {
            await window.ENGINE_WORKER_CLIENT.addCharacterToPartyByScriptGivenId({ charScriptGivenId: partyId });
        }
    }

    if (!isSelfInsert) {
        await window.ENGINE_WORKER_CLIENT.assumeCharacterIdentityByScriptGivenId({ charScriptGivenId: scriptGivenId });
    }
}
