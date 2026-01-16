DE.world.initialScenes["Default Scene"] = /** @type {DEInitialScene} */ ({
    startingLocation: "LUNAR_MODULE",
    startingLocationSlot: "AIRLOCK_ENTRANCE",
    narration: DE.utils.newHandlebarsTemplate(
        "DEFAULT_WORLD_SCENE",
        "{{user}} is a visitor to the Lunar Station, eager to explore this small outpost in space, yet {{format_pronoun user}} didn't expect to find someone else here, but it so happens that {{format_and all_world_characters_but_user}} {{format_verb_to_be all_world_characters_but_user}} also visiting the station at this time, now they face each other in the common area near the airlock."
    ),
    charactersStart: true,
    startingEngagedCharacters: ["Dema"],
});

const vaccuumWeatherSystem = DE.utils.newWeatherSystem({
    name: "Vaccuum",
    likelihood: 1.0,
    fullyProtectingStates: [],
    partiallyProtectingStates: [],
    applyingStatesDuringNegativeEffect: ["ASPHYXIATING", "FREEZING"],
    applyingStatesDuringNoEffect: [],
    applyStatesInOrder: false,
    fullEffectDescription: DE.utils.newHandlebarsTemplate(
        "VACCUUM_FULL_EFFECT",
        "The lack of atmosphere asphixiates and freezes {{char}}"
    ),
    partialEffectDescription: DE.utils.newHandlebarsTemplate(
        "VACCUUM_FULL_EFFECT",
        "The lack of atmosphere asphixiates and freezes {{char}}"
    ),
    fullEffectKills: true,
    partialEffectKills: true,
    // better run back inside quickly, only one chance with this little time given
    fullEffectKillsExposureHours: 0.0083,
    partialEffectKillsExposureHours: 0.0083,
    maxDurationInHours: 0,
    minDurationInHours: 0,
    negativeEffectKills: true,
    negativeEffectKillsExposureHours: 0.0083,
    negativelyAffectingStates: [],
    negativelyAffectingWornItems: [],
    negativelyAffectedNaked: true,
    fullyProtectedNaked: false,
    partiallyProtectedNaked: false,
    fullyProtectingWornItems: ["Space Suit"],
    partiallyProtectingWornItems: [],
    noEffectDescription: DE.utils.newHandlebarsTemplate(
        "VACCUUM_NO_EFFECT",
        "{{char}} is safe from the vaccuum"
    ),

    applyingStatesDuringFullEffect: ["ASPHYXIATING", "FREEZING"],
    applyingStatesDuringPartialEffect: ["ASPHYXIATING"],
})

/**
 * @type {DEItem}
 */
const spaceSuit = {
    name: "Space Suit",
    description: "A bulky space suit designed for extra-vehicular activity on the lunar surface. It provides life support and protection from the harsh environment of space.",
    weightKg: 20,
    volumeLiters: 150,
    properties: {},
    placement: "In the lunar station locker",
    capacityKg: 0,
    capacityLiters: 0,
    amount: 2,
    canLieOn: false,
    canSitOn: false,
    compartimentName: null,
    consumableProperties: null,
    containing: [],
    coversNakedness: true,
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    nonPickable: false,
}

DE.world.locations["Surface of the Moon"] = DE.utils.newLocationFromStaticDefinition({
    description: DE.utils.newHandlebarsTemplate(
        "MOON_DESCRIPTION",
        "The barren, grey surface of the Moon stretches out in all directions, dotted with craters and rocks. The sky above is a pitch-black void, with the Earth hanging in the distance. The silence is absolute, broken only by the faint hum of distant machinery from the lunar station nearby."
    ),
    entrances: [],
    isIndoors: false,
    isPrivate: false,
    isSafe: false,
    locationFullyBlocksWeather: [],
    locationPartiallyBlocksWeather: [],
    maxHeightCm: 0,
    maxVolumeLiters: 0,
    maxWeightKg: 0,
    ownWeatherSystem: [vaccuumWeatherSystem],
    properties: {},
    parent: null,
    slots: {
        "MOON_SURFACE": {
            description: DE.utils.newHandlebarsTemplate(
                "MOON_SURFACE_SLOT_DESCRIPTION",
                "The open expanse of the lunar surface, with its grey dust and scattered rocks."
            ),
            items: [
                {
                    name: "Lunar rock",
                    description: "A small, jagged rock from the surface of the Moon. It's covered in a fine layer of grey dust.",
                    weightKg: 0.5,
                    volumeLiters: 0.2,
                    properties: {},
                    capacityKg: 0,
                    capacityLiters: 0,
                    amount: 10000,
                    canLieOn: false,
                    canSitOn: false,
                    compartimentName: null,
                    consumableProperties: null,
                    containing: [],
                    coversNakedness: false,
                    descriptionWhenCarried: null,
                    descriptionWhenWorn: null,
                    isConsumable: false,
                    isSeeThrough: false,
                    nonPickable: false,
                    placement: "In the ground",
                }
            ],
        },
    },
});