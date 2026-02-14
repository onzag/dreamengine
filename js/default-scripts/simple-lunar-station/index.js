DE.world.initialScenes["Default Scene"] = /** @type {DEInitialScene} */ ({
    startingLocation: "Lunar Station",
    startingLocationSlot: "Common Area",
    narration: DE.utils.newHandlebarsTemplate(
        DE,
        "DEFAULT_WORLD_SCENE",
        "{{user}} is a visitor to the Lunar Station, eager to explore this small outpost in space, yet {{format_pronoun user}} didn't expect to find someone else here, but it so happens that {{format_and (all_world_characters_but_user)}} {{format_verb_to_be (all_world_characters_but_user)}} also visiting the station at this time, now they face each other in the common area near the airlock"
    ),
    charactersStart: true,
    startingEngagedCharacters: ["Dema"],
});

DE.world.lore = DE.utils.newHandlebarsTemplate(
    DE,
    "LUNAR_STATION_LORE",
    "The world is set on a small lunar station orbiting the Moon. The station serves as a research outpost and habitat for astronauts and scientists studying the lunar environment. The station is equipped with life support systems, scientific laboratories, living quarters, and communication facilities. Outside the station, the barren surface of the Moon stretches out, dotted with craters and rocks. The sky above is a pitch-black void, with the Earth hanging in the distance. The silence is absolute, broken only by the faint hum of the station's machinery"
);

const vaccuumWeatherSystem = DE.utils.newWeatherSystem(DE, {
    name: "Vaccuum",
    likelihood: 1.0,
    fullyProtectingStates: [],
    partiallyProtectingStates: [],
    applyingStatesDuringNegativeEffect: [
        {
            stateName: "ASPHYXIATING_VACCUUM",
            intensity: 4,
        },
        {
            stateName: "FREEZING_VACCUUM",
            intensity: 4,
        },
    ],
    applyingStatesDuringNoEffect: [],
    applyStatesInOrder: false,
    fullEffectDescription: DE.utils.newHandlebarsTemplate(
        DE,
        "VACCUUM_FULL_EFFECT",
        "The lack of atmosphere asphixiates and freezes {{char}}"
    ),
    partialEffectDescription: DE.utils.newHandlebarsTemplate(
        DE,
        "VACCUUM_FULL_EFFECT",
        "The lack of atmosphere asphixiates and freezes {{char}}"
    ),
    maxDurationInHours: 0,
    minDurationInHours: 0,
    negativelyAffectingStates: [],
    negativelyAffectingWornItems: [],
    negativelyAffectedNaked: true,
    fullyProtectedNaked: false,
    partiallyProtectedNaked: false,
    fullyProtectingWornItems: ["Space Suit"],
    fullyProtectingCarriedItems: [],
    partiallyProtectingCarriedItems: [],
    fullyProtectedTemplate: DE.utils.newTemplateFromFunction(
        DE,
        "VACCUUM_WEATHER_EFFECT_PROTECTED_FROM_ROBOTS",
        async (DE, char) => {
            if (char.properties["IS_ROBOT"]) {
                return `"${char.name}" is a robot and is inpervious to the vaccuum of space`;
            }
            return "";
        }
    ),
    partiallyProtectingWornItems: [],
    negativelyAffectingCarriedItems: [],
    noEffectDescription: DE.utils.newHandlebarsTemplate(
        DE,
        "VACCUUM_NO_EFFECT",
        "{{char}} is safe from the vaccuum"
    ),
    negativelyExposedDescription: DE.utils.newHandlebarsTemplate(
        DE,
        "VACCUUM_NEGATIVELY_EXPOSED_EFFECT",
        "The lack of atmosphere specially asphixiates and freezes {{char}} very quickly",
    ),

    applyingStatesDuringFullEffect: [
        {
            stateName: "ASPHYXIATING_VACCUUM",
            intensity: 4,
        },
        {
            stateName: "FREEZING_VACCUUM",
            intensity: 4,
        },
    ],
    applyingStatesDuringPartialEffect: [
        {
            stateName: "ASPHYXIATING_VACCUUM",
            intensity: 2,
        }
    ],
})

/**
 * @type {DEItem}
 */
const spaceSuit = {
    name: "Space Suit",
    description: "A bulky space suit designed for extra-vehicular activity on the lunar surface. It provides life support and protection from the harsh environment of space",
    weightKg: 20,
    volumeLiters: 150,
    properties: {},
    placement: "In the lunar station locker",
    capacityKg: 0,
    capacityLiters: 0,
    amount: 2,
    consumableProperties: null,
    containing: [],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 10,
    maxWeightOnTopKg: 40,
    ontopCharacters: [],
    wearableProperties: {
        coversTopNakedness: true,
        coversBottomNakedness: true,
        volumeRangeMinLiters: 50,
        volumeRangeMaxLiters: 160,
        addedCarryingCapacityKg: 10,
        addedCarryingCapacityLiters: 0,
        extraBodyVolumeWhenWornLiters: 160,
        fullyProtectsFromWeathers: ["Vaccuum", "Rain", "Snow"],
        partiallyProtectsFromWeathers: [],
    },
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
}

/**
 * @type {DEItem}
 */
const locker = {
    name: "Locker",
    description: "A sturdy locker used for storing personal belongings and equipment within the lunar station",
    weightKg: 1500,
    volumeLiters: 1000,
    properties: {},
    placement: "In the common area corner",
    capacityKg: 50,
    capacityLiters: 1000,
    amount: 1,
    consumableProperties: null,
    containing: [spaceSuit],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 100,
    maxWeightOnTopKg: 100,
    ontopCharacters: [],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

/**
 * @type {DEItem}
 */
const stove = {
    name: "Stove",
    description: "A compact stove designed for cooking meals in the confined space of the lunar station. It features multiple burners and a small oven",
    weightKg: 30,
    volumeLiters: 100,
    properties: {},
    placement: "In the cooking area",
    capacityKg: 0,
    capacityLiters: 0,
    amount: 1,
    consumableProperties: null,
    containing: [],
    ontop: [],
    ontopCharacters: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 100,
    maxWeightOnTopKg: 100,
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

/**
 * @type {DEItem}
 */
const fork = {
    name: "Fork",
    description: "A standard eating utensil with four tines, used for picking up and eating food",
    weightKg: 0.1,
    volumeLiters: 0.05,
    properties: {},
    placement: "In the cabinet drawer",
    capacityKg: 0,
    capacityLiters: 0,
    amount: 10,
    consumableProperties: null,
    containing: [],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 1,
    maxWeightOnTopKg: 10,
    ontopCharacters: [],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

const spoon = {
    name: "Spoon",
    description: "A standard eating utensil with a rounded bowl, used for scooping and eating food",
    weightKg: 0.1,
    volumeLiters: 0.05,
    properties: {},
    placement: "In the cabinet drawer",
    capacityKg: 0,
    capacityLiters: 0,
    amount: 10,
    consumableProperties: null,
    containing: [],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 1,
    maxWeightOnTopKg: 10,
    ontopCharacters: [],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

const cabinetDrawerKitchenware = {
    name: "Cabinet Drawer",
    description: "A small drawer within the lunar station's kitchenette, used for storing utensils and small kitchen items",
    weightKg: 5,
    volumeLiters: 20,
    properties: {},
    placement: "In the cooking area cabinet",
    capacityKg: 10,
    capacityLiters: 20,
    amount: 1,
    consumableProperties: null,
    containing: [fork, spoon],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 0,
    maxWeightOnTopKg: 0,
    ontopCharacters: [],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

const bowl = {
    name: "Bowl",
    description: "A small bowl used for holding food or liquids",
    weightKg: 0.2,
    volumeLiters: 0.5,
    properties: {},
    placement: "In the cabinet drawer",
    capacityKg: 1,
    capacityLiters: 0.5,
    amount: 5,
    consumableProperties: null,
    containing: [],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 0,
    maxWeightOnTopKg: 0,
    ontopCharacters: [],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

const cabinetDrawerBowls = {
    name: "Cabinet Drawer",
    description: "A small drawer within the lunar station's kitchenette, used for storing utensils and small kitchen items",
    weightKg: 5,
    volumeLiters: 20,
    properties: {},
    placement: "In the cooking area cabinet",
    capacityKg: 10,
    capacityLiters: 20,
    amount: 1,
    consumableProperties: null,
    containing: [bowl],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 0,
    maxWeightOnTopKg: 0,
    ontopCharacters: [],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

const cabinet = {
    name: "Cabinet",
    description: "A storage cabinet in the lunar station's kitchenette, used for storing food items, utensils, and kitchen supplies",
    weightKg: 50,
    volumeLiters: 200,
    properties: {},
    placement: "In the cooking area",
    capacityKg: 100,
    capacityLiters: 200,
    amount: 1,
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 100,
    maxWeightOnTopKg: 100,
    ontopCharacters: [],
    consumableProperties: null,
    containing: [cabinetDrawerKitchenware, cabinetDrawerBowls],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

/**
 * @type {DEItem}
 */
const spaceFoodPack = {
    name: "Space Food Pack",
    description: "A compact, vacuum-sealed food pack designed for consumption in space. It contains a nutritious meal suitable for astronauts",
    weightKg: 0.5,
    volumeLiters: 0.3,
    properties: {},
    placement: "In the large cabinet",
    capacityKg: 0,
    capacityLiters: 0,
    amount: 10000,
    consumableProperties: {
        calories: 2500,
        hydrationLiters: 2,
    },
    containing: [],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 0,
    maxWeightOnTopKg: 0,
    ontopCharacters: [],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: true,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

const largeCabinet = {
    name: "Large Cabinet",
    description: "A large storage cabinet in the lunar station's kitchenette, used for storing bulk food items and kitchen supplies",
    weightKg: 500,
    volumeLiters: spaceFoodPack.volumeLiters * spaceFoodPack.amount + 100,
    properties: {},
    placement: "In the cooking area ground",
    capacityKg: spaceFoodPack.weightKg * spaceFoodPack.amount + 100,
    capacityLiters: spaceFoodPack.volumeLiters * spaceFoodPack.amount + 100,
    amount: 1,
    compartimentName: "Inside the large cabinet",
    consumableProperties: null,
    containing: [spaceFoodPack],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 100,
    maxWeightOnTopKg: 100,
    ontopCharacters: [],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

/**
 * @type {DEItem}
 */
const chair = {
    name: "Chair",
    description: "A simple chair made of metal and plastic, designed for use in the lunar station's common area",
    weightKg: 5,
    volumeLiters: 30,
    properties: {},
    placement: "On the floor",
    capacityKg: 150,
    capacityLiters: 150,
    amount: 4,
    consumableProperties: null,
    containing: [],
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 100,
    maxWeightOnTopKg: 300,
    ontopCharacters: [],
    isConsumable: false,
    isSeeThrough: false,
    owner: null,
    communicator: null,
};

DE.world.locations["Surface of the Moon"] = DE.utils.newLocationFromStaticDefinition(DE, {
    description: DE.utils.newHandlebarsTemplate(
        DE,
        "MOON_DESCRIPTION",
        "The barren, grey surface of the Moon stretches out in all directions, dotted with craters and rocks. The sky above is a pitch-black void, with the Earth hanging in the distance. The silence is absolute, broken only by the faint hum of distant machinery from the lunar station nearby"
    ),
    entrances: [],
    isIndoors: false,
    isPrivate: false,
    isSafe: false,
    locationFullyBlocksWeather: [],
    locationPartiallyBlocksWeather: [],
    locationNegativelyExposesCharactersToWeather: [],
    maxHeightCm: 0,
    maxVolumeLiters: 0,
    maxWeightKg: 0,
    ownWeatherSystem: [vaccuumWeatherSystem],
    properties: {},
    parent: null,
    slots: {
        "Moon Surface": {
            description: DE.utils.newHandlebarsTemplate(
                DE,
                "MOON_SURFACE_SLOT_DESCRIPTION",
                "The open expanse of the lunar surface, with its grey dust and scattered rocks"
            ),
            maxVolumeLiters: 0,
            maxWeightKg: 0,
            items: [
                {
                    name: "Lunar rock",
                    description: "A small, jagged rock from the surface of the Moon. It's covered in a fine layer of grey dust",
                    weightKg: 0.5,
                    volumeLiters: 0.2,
                    properties: {},
                    capacityKg: 0,
                    capacityLiters: 0,
                    amount: 10000,
                    consumableProperties: null,
                    containing: [],
                    ontop: [],
                    containingCharacters: [],
                    maxVolumeOnTopLiters: 10,
                    maxWeightOnTopKg: 1000,
                    ontopCharacters: [],
                    descriptionWhenCarried: null,
                    descriptionWhenWorn: null,
                    isConsumable: false,
                    isSeeThrough: false,
                    placement: "In the ground",
                    owner: null,
                    communicator: null,
                }
            ],
        },
    },
});

DE.world.locations["Lunar Station"] = DE.utils.newLocationFromStaticDefinition(DE, {
    description: DE.utils.newHandlebarsTemplate(
        DE,
        "LUNAR_STATION_DESCRIPTION",
        "A small lunar station orbiting the Moon. The station serves as a research outpost and habitat for astronauts and scientists studying the lunar environment. The station is equipped with life support systems, scientific laboratories, living quarters, and communication facilities"
    ),
    entrances: [
        {
            autoLocks: true,
            description: DE.utils.newHandlebarsTemplate(
                DE,
                "LUNAR_MODULE_AIRLOCK_DESCRIPTION",
                "A sturdy airlock door that separates the interior of the lunar station from the vacuum of space outside. The door is made of reinforced metal and features a small window for viewing the exterior",
            ),
            canBeUnlockedByCharacters: [],
            canBeUnlockedByWithItems: [
                "Lunar Station Airlock Keycard",
            ],
            isCurrentlyLocked: true,
            canBeUnlockedFromInsideWithoutRequirements: false,
            otherUnlockConditions: [],
            canHearFromInsideOutside: false,
            maxHeightCm: 500,
            maxVolumeLiters: 500,
            maxWeightKg: 500,
            name: "Lunar Station Airlock",
        },
    ],
    isIndoors: true,
    isPrivate: false,
    isSafe: true,
    locationFullyBlocksWeather: [
        "Vaccuum",
    ],
    locationPartiallyBlocksWeather: [],
    locationNegativelyExposesCharactersToWeather: [],
    maxHeightCm: 500,
    maxVolumeLiters: 2000,
    maxWeightKg: 2000,
    ownWeatherSystem: [],
    parent: "Surface of the Moon",
    properties: {},
    slots: {
        "Common Area": {
            description: DE.utils.newHandlebarsTemplate(
                DE,
                "LUNAR_STATION_COMMON_AREA_SLOT_DESCRIPTION",
                "The common area of the lunar station, featuring a few chairs, a table, and a small kitchenette. The walls are lined with control panels and monitors displaying various data about the station's systems"
            ),
            items: [
                locker,
                chair,
            ],
            maxVolumeLiters: 2000,
            maxWeightKg: 2000,
        },
        "Cooking Area": {
            description: DE.utils.newHandlebarsTemplate(
                DE,
                "LUNAR_STATION_COOKING_AREA_SLOT_DESCRIPTION",
                "A small kitchenette area with a compact stove, a sink, and storage cabinets. There are a few packaged food items and utensils stored here for the crew to use"
            ),
            items: [
                chair,
                stove,
                largeCabinet,
                cabinet,
            ],
            maxVolumeLiters: 2000,
            maxWeightKg: 2000,
        },
    },
});

DE.world.connections["LUNAR_STATION_TO_MOON_SURFACE"] = DE.utils.newConnectionFromStaticDefinition(DE, {
    from: "Lunar Station",
    to: "Surface of the Moon",
    bidirectional: true,
    distanceMeters: 0,
    maxHeightCm: 0,
    maxVolumeLiters: 0,
    maxWeightKg: 0,
    onlyVehicles: false,
    otherPassageConditions: {},
    vehicleTypes: [],
});

for (let i = 0; i < 2; i++) {
    const letter = String.fromCharCode(65 + i);
    DE.world.locations["Lunar Station Bedroom " + letter] = DE.utils.newLocationFromStaticDefinition(DE, {
        description: DE.utils.newHandlebarsTemplate(
            DE,
            "LUNAR_STATION_DESCRIPTION_BEDROOM_" + letter,
            "A small, utilitarian bedroom within the lunar station. The room is sparsely furnished with a bunk bed, a small desk, and a locker for personal belongings. A porthole window offers a view of the lunar surface below"
        ),
        entrances: [
            {
                autoLocks: true,
                description: DE.utils.newHandlebarsTemplate(
                    DE,
                    "LUNAR_MODULE_DOOR_DESCRIPTION_BEDROOM_" + letter,
                    "A sturdy door that leads to the common area of the lunar station. The door is made of reinforced metal",
                ),
                canBeUnlockedByCharacters: [],
                canBeUnlockedByWithItems: [
                    "Lunar Station Bedroom " + letter + " Keycard",
                ],
                isCurrentlyLocked: true,
                canBeUnlockedFromInsideWithoutRequirements: false,
                otherUnlockConditions: [],
                canHearFromInsideOutside: false,
                maxHeightCm: 500,
                maxVolumeLiters: 500,
                maxWeightKg: 500,
                name: "Lunar Station Door " + letter,
            },
        ],
        isIndoors: true,
        isPrivate: false,
        isSafe: true,
        locationFullyBlocksWeather: [
            "Vaccuum",
        ],
        locationPartiallyBlocksWeather: [],
        locationNegativelyExposesCharactersToWeather: [],
        maxHeightCm: 500,
        maxVolumeLiters: 500,
        maxWeightKg: 500,
        ownWeatherSystem: [],
        parent: "Lunar Station",
        properties: {},
        slots: {
            "Bedroom Area": {
                description: DE.utils.newHandlebarsTemplate(
                    DE,
                    "LUNAR_STATION_BEDROOM_SLOT_DESCRIPTION_" + letter,
                    "The bedroom area of the lunar station, featuring a bunk bed, a small desk, and a locker for personal belongings"
                ),
                maxVolumeLiters: 2000,
                maxWeightKg: 2000,
                items: [
                    {
                        name: "Bunk Bed",
                        description: "A sturdy bunk bed designed for use in the confined space of the lunar station. It features a simple mattress and bedding",
                        weightKg: 20,
                        volumeLiters: 100,
                        properties: {},
                        placement: "In the Bedroom Area",
                        capacityKg: 0,
                        capacityLiters: 0,
                        amount: 1,
                        consumableProperties: null,
                        containing: [],
                        ontop: [],
                        containingCharacters: [],
                        maxVolumeOnTopLiters: 500,
                        maxWeightOnTopKg: 400,
                        ontopCharacters: [],
                        descriptionWhenCarried: null,
                        descriptionWhenWorn: null,
                        isConsumable: false,
                        isSeeThrough: false,
                        owner: null,
                        communicator: null,
                    }
                ],
            },
        },
    });

    DE.world.connections["LUNAR_STATION_BEDROOM_" + letter + "_TO_LUNAR_STATION"] = DE.utils.newConnectionFromStaticDefinition(DE, {
        from: "Lunar Station Bedroom " + letter,
        to: "Lunar Station",
        bidirectional: true,
        distanceMeters: 0,
        maxHeightCm: 0,
        maxVolumeLiters: 0,
        maxWeightKg: 0,
        onlyVehicles: false,
        otherPassageConditions: {},
        vehicleTypes: [],
    });
}

DE.world.worldAllCharacterSpawnScripts["LUNAR_STATION_INITIAL_SCRIPT"] = DE.utils.newScript(DE, "LUNAR_STATION_INITIAL_SCRIPT", async (DE, char) => {
    // give all characters the ASPHYXIATING_VACCUUM and FREEZING_VACCUUM states
    char.states["ASPHYXIATING_VACCUUM"] = {
        randomSpawnRate: 0,
        permanent: false,
        modifiesStatesIntensitiesOnTrigger: {},
        requiredStates: [],
        requiresCharacterCausants: false,
        requiresObjectCausants: false,
        requiresPosture: null,
        seeksPosture: "laying_down",
        injuryAndDeath: true,
        intensityModifiers: [
            {
                determineCausants: null,
                intensity: -4,
                template: DE.utils.newHandlebarsTemplate(
                    DE,
                    "ASPHYXIATING_VACCUUM_REMOVAL_INTENSITY_MODIFIER",
                    "has {{char}} returned to a pressurized environment successfully?"
                ),
            },
            {
                determineCausants: null,
                intensity: -4,
                template: DE.utils.newHandlebarsTemplate(
                    DE,
                    "ASPHYXIATING_VACCUUM_REMOVAL_INTENSITY_MODIFIER_SPACE_SUIT",
                    "has {{char}} put on a space suit?"
                ),
            }
        ],
        // need no triggers, the weather system will apply the state
        triggers: [],
        triggersStates: {},

        // No reasoning required, obviously should get out of the vaccuum
        // what else could it be?
        actionPromptInjection: {
            "RETURN_TO_AIRLOCK": {
                action: DE.utils.newHandlebarsTemplate(
                    DE,
                    "RETURN_TO_AIRLOCK_PROMPT",
                    "{{char}} has an urgent need to return to the airlock and into the lunar station to avoid asphyxiation"
                ),
                forceDominant: true,
                intensityModification: 0,
                isDeadEndScenario: false,
                deadEndIsDeath: false,
                primaryEmotion: "fearful",
                emotionalRange: [],
            },
        },
        behaviourType: "BINARY",
        conflictStates: [],
        deadEndIsDeath: true,
        // 30 seconds to death by asphyxiation
        deadEndByTimeInMinutes: 0.5,
        triggersDeadEnd: DE.utils.newHandlebarsTemplate(
            DE,
            "ASPHYXIATING_VACCUUM_DEAD_END_TRIGGER",
            "{{char}} has run out of air and has asphyxiated in the vacuum of space"
        ),
        intensityChangeRatePerInferenceCycle: 0,
        dominance: 10,
        fallsDown: false,
        general: DE.utils.newHandlebarsTemplate(
            DE,
            "ASPHYXIATING_VACCUUM_GENERAL",
            "{{char}} is struggling to breathe in the vacuum of space"
        ),
    };

    char.states["FREEZING_VACCUUM"] = {
        randomSpawnRate: 0,
        permanent: false,
        modifiesStatesIntensitiesOnTrigger: {},
        requiredStates: [],
        requiresCharacterCausants: false,
        requiresObjectCausants: false,
        requiresPosture: null,
        seeksPosture: null,
        injuryAndDeath: true,
        intensityModifiers: [
            {
                determineCausants: null,
                intensity: -1,
                template: DE.utils.newHandlebarsTemplate(
                    DE,
                    "FREEZING_VACCUUM_REMOVAL_INTENSITY_MODIFIER",
                    "has {{char}} returned to a pressurized environment successfully?"
                ),
            },
            {
                determineCausants: null,
                intensity: -1,
                template: DE.utils.newHandlebarsTemplate(
                    DE,
                    "FREEZING_VACCUUM_REMOVAL_INTENSITY_MODIFIER_SPACE_SUIT",
                    "has {{char}} put on a space suit?"
                ),
            },
        ],
        usesReliefDynamic: true,
        relieving: DE.utils.newHandlebarsTemplate(
            DE,
            "FREEZING_VACCUUM_RELIEVING",
            "{{char}} is recovering from the severe freezing effects of the vacuum of space and should look for warmth"
        ),
        intensityChangeRatePerInferenceCycleAfterRelief: -0.1,
        intensityModifiersDuringRelief: [
            {
                determineCausants: null,
                intensity: -1,
                template: DE.utils.newHandlebarsTemplate(
                    DE,
                    "FREEZING_VACCUUM_RELIEF_INTENSITY_MODIFIER",
                    "has {{char}} put on a blanket, warm clothes or similar?"
                ),
            },
            {
                determineCausants: null,
                intensity: -2,
                template: DE.utils.newHandlebarsTemplate(
                    DE,
                    "FREEZING_VACCUUM_RELIEF_INTENSITY_MODIFIER_2",
                    "has {{char}} taken a hot shower?"
                ),
            },
        ],
        // need no triggers, the weather system will apply the state
        triggers: [],
        triggersStates: {},
        actionPromptInjection: {},
        behaviourType: "BINARY",
        conflictStates: [],
        deadEndIsDeath: true,
        // 5 minutes to death by freezing
        deadEndByTimeInMinutes: 5,
        triggersDeadEnd: DE.utils.newHandlebarsTemplate(
            DE,
            "FREEZING_VACCUUM_DEAD_END_TRIGGER",
            "{{char}} has succumbed to the extreme cold of the vacuum of space"
        ),
        intensityChangeRatePerInferenceCycle: 0,
        dominance: 10,
        dominanceAfterRelief: 1,
        fallsDown: false,
        general: DE.utils.newHandlebarsTemplate(
            DE,
            "FREEZING_VACCUUM_GENERAL",
            "{{char}} is freezing in the vacuum of space"
        ),
    };
});