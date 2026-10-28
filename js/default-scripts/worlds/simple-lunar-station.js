const standardApp = await importScript("@std", "standard-app");

engine.exports = {
    type: "world",
    description: "A serene lunar station orbiting earth, featuring advanced technology and breathtaking views of space.",
    language: "en",
    metadata: {
        __intro: [
            {
                title: "Moon Surface, Year 2307",
                subtitle: "After two centuries of severe global warming, and severe scientific setback due to the Artemis Catastrophe, humanity has finally established a small lunar station on the moon surface.",
            },
        ],
    },
    exposeProperties: {
        "IS_ROBOT": {
            propertyLocation: "characters",
            type: "boolean",
            description: "Whether the character is a robot or not. Robots are impervious to the vaccuum of space weather system",
        }
    },
    onSceneStarted(DE, scene) {
        // TODO remove this testing stuff
        DE.utils.conversations.addMessageIntoTargetConversation(DE.user, {
            metadata: {},
            canOnlyBeSeenByCharacter: null,
            content: [
                {
                    type: "dialogue",
                    fragments: [
                        {
                            type: "sound",
                            soundInfo: {},
                            text: "surprised",
                        },
                        {
                            type: "sound",
                            soundInfo: {},
                            text: "gasp",
                        },
                        {
                            type: "dialogue",
                            "fragments": [
                                "Booo! I am a ghost :3 Don't listen to Dema",
                            ],
                        },
                    ],
                },
            ],
            emotion: "surprised",
            emotionalRange: [
                "surprised",
                "amazed",
                "shocked",
            ],
            interactingCharacters: [],
            isCharacter: true,
            isDebugMessage: false,
            isStoryMasterMessage: false,
            isHiddenMessage: false,
            isRejectedMessage: false,
            perspectiveSummaryIds: {},
            rumors: [],
            characterId: null,
            singleSummary: null,
        }, {
            ghost: true,
        });
    },
    initialize(DE) {
        /**
         * @type {DEWeatherSystem}
         */
        const vaccuumWeatherSystem = {
            name: "Vaccuum",
            likelihood: 1.0,
            fullyProtectingStates: [],
            partiallyProtectingStates: [],
            applyingStatesDuringNegativeEffect: [
                {
                    stateName: "Asphyxiating in the Vaccuum",
                    intensity: 4,
                },
                {
                    stateName: "Freezing in the Vaccuum",
                    intensity: 4,
                },
            ],
            applyingStatesDuringNoEffect: [],
            applyStatesInOrder: false,
            fullEffectDescription: (info) => `The lack of atmosphere asphixiates and freezes ${info.char.name}`,
            partialEffectDescription: (info) => `The lack of atmosphere asphixiates and freezes ${info.char.name}`,
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
            fullyProtectedTemplate: (info) => {
                if (info.char?.state["IS_ROBOT"]) {
                    return `"${info.char.name}" is a robot and is inpervious to the vaccuum of space`;
                }
                return "";
            },
            partiallyProtectingWornItems: [],
            negativelyAffectingCarriedItems: [],
            noEffectDescription: (info) => `${info.char.name} is safe from the vaccuum`,
            negativelyExposedDescription: (info) => `The lack of atmosphere specially asphixiates and freezes ${info.char.name} very quickly`,

            applyingStatesDuringFullEffect: [
                {
                    stateName: "Asphyxiating in the Vaccuum",
                    intensity: 4,
                },
                {
                    stateName: "Freezing in the Vaccuum",
                    intensity: 4,
                },
            ],
            applyingStatesDuringPartialEffect: [
                {
                    stateName: "Asphyxiating in the Vaccuum",
                    intensity: 2,
                }
            ],
        };

        const spaceSuitFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Space Suit",
            description: "A bulky space suit designed for extra-vehicular activity on the lunar surface. It provides life support and protection from the harsh environment of space",
            weightKg: 20,
            volumeLiters: 150,
            state: {},
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/space_suit.jpg",
            }),
            consumableProperties: null,
            containing: [],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 10,
            maxWeightOnTopKg: 40,
            ontopCharacters: [],
            wearableProperties: {
                underwear: false,
                preferredGender: "any",
                coversTopNakedness: true,
                coversBottomNakedness: true,
                volumeRangeMinLiters: 50,
                volumeRangeMaxLiters: 160,
                volumeRangeFlexibilityLeewayLoose: 100,
                volumeRangeFlexibilityLeewaySnug: 0,
                otherFitmentTraitsAny: ["hides face"],
                addedCarryingCapacityKg: 10,
                addedCarryingCapacityLiters: 0,
                extraBodyVolumeWhenWornLiters: 160,
                fullyProtectsFromWeathers: ["Vaccuum", "Rain", "Snow"],
                partiallyProtectsFromWeathers: [],
            },
            owner: null,
            communicator: null,
        }));

        const lockerFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Locker",
            description: "A sturdy locker used for storing personal belongings and equipment within the lunar station",
            weightKg: 1500,
            volumeLiters: 1000,
            state: {},
            containerProperties: {
                capacityKg: 50,
                capacityLiters: 1000,
                structure: "rigid",
                canSeeContentsFromOutside: false,
            },
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/locker.jpg",
            }),
            consumableProperties: null,
            containing: spaceSuitFactory(2),
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 100,
            maxWeightOnTopKg: 100,
            ontopCharacters: [],
            owner: null,
            communicator: null,
        }));

        const stoveFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Stove",
            description: "A compact stove designed for cooking meals in the confined space of the lunar station. It features multiple burners and a small oven",
            weightKg: 30,
            volumeLiters: 100,
            state: {},
            containerProperties: {
                capacityKg: 100,
                capacityLiters: 20,
                structure: "rigid",
                canSeeContentsFromOutside: false,
            },
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/stove.jpg",
            }),
            consumableProperties: null,
            containing: [],
            ontop: [],
            ontopCharacters: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 100,
            maxWeightOnTopKg: 100,
            owner: null,
            communicator: null,
        }));

        const forkFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Fork",
            description: "A standard eating utensil with four tines, used for picking up and eating food",
            weightKg: 0.1,
            volumeLiters: 0.05,
            state: {},
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/fork.jpg",
            }),
            consumableProperties: null,
            containing: [],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 1,
            maxWeightOnTopKg: 10,
            ontopCharacters: [],
            owner: null,
            communicator: null,
        }));

        const spoonFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Spoon",
            description: "A standard eating utensil with a rounded bowl, used for scooping and eating food",
            weightKg: 0.1,
            volumeLiters: 0.05,
            state: {},
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/spoon.jpg",
            }),
            consumableProperties: null,
            containing: [],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 1,
            maxWeightOnTopKg: 10,
            ontopCharacters: [],
            owner: null,
            communicator: null,
        }));

        const cabinetDrawerKitchenwareFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Cabinet Drawer",
            description: "A small drawer within the lunar station's kitchenette, used for storing utensils and small kitchen items",
            weightKg: 5,
            volumeLiters: 20,
            state: {},
            containerProperties: {
                capacityKg: 10,
                capacityLiters: 20,
                structure: "rigid",
                canSeeContentsFromOutside: false,
            },
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/cabinet_drawer.jpg",
            }),
            consumableProperties: null,
            containing: [
                ...forkFactory(10),
                ...spoonFactory(10)
            ],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 0,
            maxWeightOnTopKg: 0,
            ontopCharacters: [],
            owner: null,
            communicator: null,
        }));

        const bowlFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Bowl",
            description: "A small bowl used for holding food or liquids",
            weightKg: 0.2,
            volumeLiters: 0.5,
            state: {},
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/bowl.jpg",
            }),
            containerProperties: {
                capacityKg: 1,
                capacityLiters: 0.5,
                structure: "rigid",
                canSeeContentsFromOutside: false,
            },
            consumableProperties: null,
            containing: [],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 0,
            maxWeightOnTopKg: 0,
            ontopCharacters: [],
            owner: null,
            communicator: null,
        }));

        const cabinetDrawerBowlsFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Cabinet Drawer",
            description: "A small drawer within the lunar station's kitchenette, used for storing utensils and small kitchen items",
            weightKg: 5,
            volumeLiters: 20,
            state: {},
            containerProperties: {
                capacityKg: 10,
                capacityLiters: 20,
                structure: "rigid",
                canSeeContentsFromOutside: false,
            },
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/cabinet_drawer.jpg",
            }),
            consumableProperties: null,
            containing: [
                ...bowlFactory(10),
            ],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 0,
            maxWeightOnTopKg: 0,
            ontopCharacters: [],
            owner: null,
            communicator: null,
        }));

        const cabinetFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Cabinet",
            description: "A storage cabinet in the lunar station's kitchenette, used for storing food items, utensils, and kitchen supplies",
            weightKg: 50,
            volumeLiters: 200,
            state: {},
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/cabinet.jpg",
            }),
            containerProperties: {
                capacityKg: 100,
                capacityLiters: 200,
                structure: "rigid",
                canSeeContentsFromOutside: false,
            },
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 100,
            maxWeightOnTopKg: 100,
            ontopCharacters: [],
            consumableProperties: null,
            containing: [
                ...cabinetDrawerKitchenwareFactory(1),
                ...cabinetDrawerBowlsFactory(4),
            ],
            owner: null,
            communicator: null,
        }));

        const spaceFoodPackFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Space Food Pack",
            description: "A compact, vacuum-sealed food pack designed for consumption in space. It contains a nutritious meal suitable for astronauts",
            weightKg: 0.5,
            volumeLiters: 0.3,
            state: {},
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/space_food_pack.jpg",
            }),
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
            owner: null,
            communicator: null,
        }));

        const largeCabinetFactory = DE.utils.items.newClonableItemFactory(() => {
            const spaceFood = spaceFoodPackFactory(100);

            return {
                name: "Large Cabinet",
                description: "A large storage cabinet in the lunar station's kitchenette, used for storing bulk food items and kitchen supplies",
                weightKg: 500,
                volumeLiters: (spaceFood[0].volumeLiters * 100) + 100,
                state: {},
                containerProperties: {
                    capacityKg: (spaceFood[0].weightKg * 100) + 100,
                    capacityLiters: (spaceFood[0].volumeLiters * 100) + 100,
                    structure: "rigid",
                    canSeeContentsFromOutside: false,
                },
                metadata: standardApp.buildItemMetadata({
                    asset: "@assets/worlds/simple-lunar-station/large_cabinet.jpg",
                }),
                consumableProperties: null,
                containing: spaceFood,
                ontop: [],
                containingCharacters: [],
                maxVolumeOnTopLiters: 100,
                maxWeightOnTopKg: 100,
                ontopCharacters: [],
                owner: null,
                communicator: null,
            }
        });

        const chairFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Chair",
            description: "A simple chair made of metal and plastic, designed for use in the lunar station's common area",
            weightKg: 5,
            volumeLiters: 30,
            state: {},
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/chair.jpg",
            }),
            consumableProperties: null,
            containing: [],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 100,
            maxWeightOnTopKg: 300,
            ontopCharacters: [],
            owner: null,
            communicator: null,
        }));

        const rockFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Lunar rock",
            description: "A small, jagged rock from the surface of the Moon. It's covered in a fine layer of grey dust",
            weightKg: 0.5,
            volumeLiters: 0.2,
            state: {},
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/lunar_rock.jpg",
            }),
            consumableProperties: null,
            containing: [],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 10,
            maxWeightOnTopKg: 1000,
            ontopCharacters: [],
            owner: null,
            communicator: null,
        }));

        const bunkBedFactory = DE.utils.items.newClonableItemFactory(() => ({
            name: "Bunk Bed",
            description: "A sturdy bunk bed designed for use in the confined space of the lunar station. It features a simple mattress and bedding",
            weightKg: 20,
            volumeLiters: 100,
            state: {},
            metadata: standardApp.buildItemMetadata({
                asset: "@assets/worlds/simple-lunar-station/bunk_bed.jpg",
            }),
            consumableProperties: null,
            containing: [],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 500,
            maxWeightOnTopKg: 400,
            ontopCharacters: [],
            owner: null,
            communicator: null,
        }));

        const surfaceOfTheMoon = DE.utils.world.newLocation({
            name: "Surface of the Moon",
            script: engine.script,
            description: "The barren, grey surface of the Moon stretches out in all directions, dotted with craters and rocks. The sky above is a pitch-black void, with the Earth hanging in the distance. The silence is absolute, broken only by the faint hum of distant machinery from the lunar station nearby",
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
            metadata: standardApp.buildLocationMetadata({
                asset: "@assets/worlds/simple-lunar-station/moon_surface.jpg",
            }),
            state: {},
            temp: {},
            parent: null,
        }, () => [
            {
                name: "Moon Surface",
                description: "The open expanse of the lunar surface, with its grey dust and scattered rocks",
                maxVolumeLiters: 0,
                maxWeightKg: 0,
                state: {},
                temp: {},
                metadata: standardApp.buildLocationSlotMetadata({
                    asset: "@assets/worlds/simple-lunar-station/moon_surface.jpg",
                }),
                items: rockFactory(10),
            },
        ]);

        const lunarStation = DE.utils.world.newLocation({
            name: "Lunar Station",
            script: engine.script,
            description: "A small lunar station on the Moon. The station serves as a research outpost and habitat for astronauts and scientists studying the lunar environment. The station is equipped with life support systems, scientific laboratories, living quarters, and communication facilities",
            entrances: [
                {
                    autoLocks: true,
                    description: "A sturdy airlock door that separates the interior of the lunar station from the vacuum of space outside. The door is made of reinforced metal and features a small window for viewing the exterior",
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
            parent: surfaceOfTheMoon.id,
            metadata: standardApp.buildLocationMetadata({
                asset: "@assets/worlds/simple-lunar-station/image",
            }),
            temp: {},
            state: {},
        }, () => [
            {
                name: "Common Area",
                description: "The common area of the lunar station, featuring a few chairs, a table, and a small kitchenette. The walls are lined with control panels and monitors displaying various data about the station's systems",
                items: [
                    ...lockerFactory(2),
                    ...chairFactory(4),
                ],
                maxVolumeLiters: 2000,
                maxWeightKg: 2000,
                metadata: standardApp.buildLocationSlotMetadata({
                    asset: "@assets/worlds/simple-lunar-station/common_area.jpg",
                }),
                temp: {},
                state: {},
            },
            {
                name: "Cooking Area",
                description: "A small kitchenette area with a compact stove, a sink, and storage cabinets. There are a few packaged food items and utensils stored here for the crew to use",
                items: [
                    ...chairFactory(4),
                    ...stoveFactory(1),
                    ...largeCabinetFactory(1),
                    ...cabinetFactory(1),
                ],
                maxVolumeLiters: 2000,
                maxWeightKg: 2000,
                metadata: standardApp.buildLocationSlotMetadata({
                    asset: "@assets/worlds/simple-lunar-station/cooking_area.jpg",
                }),
                state: {},
                temp: {},
            },
        ]);

        DE.utils.world.newConnection({
            from: lunarStation.id,
            to: surfaceOfTheMoon.id,
            bidirectional: true,
            distanceMeters: 0,
            maxHeightCm: 0,
            maxVolumeLiters: 0,
            maxWeightKg: 0,
            onlyVehicles: false,
            otherPassageConditions: {},
            vehicleTypes: [],
            state: {},
            temp: {},
        });

        DE.world.scenes["Default Scene"] = /** @type {DEScene} */ ({
            location: lunarStation.id,
            locationSlot: Object.values(lunarStation.slots)[0].id,
            time: {
                dayOfMonth: 17,
                dayOfWeek: 1,
                hourOfDay: 12,
                minuteOfHour: 0,
                monthOfYear: 1,
                year: 2307,
                time: (new Date(2307, 0, 17, 12, 0)).getTime(),
            },
            narration: (info) => {
                const others = DE.utils.world.allWorldCharactersButUser();
                if (!others || others.length === 0) {
                    return `${DE.utils.templates.formatCharacterName(info.char, info.char)} is a visitor to the Lunar Station, eager to explore this small outpost in space. The entire station is empty and quiet, allowing ${DE.utils.templates.formatCharacterName(info.char, info.char)} to explore their surroundings in solitude.`;
                }

                const dema = others.find((c) => c.name === "Dema");
                const visitors = others.filter((c) => c.name !== "Dema");

                if (dema && visitors.length === 0) {
                    return `${DE.utils.templates.formatCharacterName(info.char, info.char)} is a visitor to the Lunar Station, eager to explore this small outpost in space. ${DE.utils.templates.formatCharacterName(dema, info.char, {
                        capitalize: true,
                        type: "indefinite",
                    })}, keeper of the station, is currently awaiting ${DE.utils.templates.formatPossessive([info.char])} arrival in the common area near the airlock, as ${DE.utils.templates.formatCharacterName(dema, info.char, {
                        capitalize: false,
                        type: "definite",
                    })} is responsible for welcoming visitors and assisting them with their needs during their stay at the station.`;
                }

                if (dema && visitors.length > 0) {
                    return `${DE.utils.templates.formatCharacterName(info.char, info.char)} is a visitor to the Lunar Station, eager to explore this small outpost in space. ${DE.utils.templates.formatCharacterName(dema, info.char, {
                        capitalize: true,
                        type: "indefinite",
                    })} , the station's keeper, is there in the common area near the airlock to welcome ${DE.utils.templates.formatPossessive([info.char])} arrival. As it turns out, ${visitors.length === 1 ? "another visitor" : "other visitors"} ${DE.utils.templates.formatVerbToBe(visitors)} also visiting the station at this time, and they all find themselves gathered together in the common area under ${DE.utils.templates.formatCharacterName(dema, info.char, {
                        capitalize: false,
                        type: "definite",
                    })}'s watchful eye.`;
                }

                return `${DE.utils.templates.formatCharacterName(info.char, info.char)} is a visitor to the Lunar Station, eager to explore this small outpost in space, yet ${visitors.length === 1 ? "another visitor" : "other visitors"} ${DE.utils.templates.formatVerbToBe(visitors)} also visiting the station at this time, and they find themselves gathered in the common area near the airlock.`;
            },
            charactersStart: true,
            engagedCharacters: () => DE.utils.world.allWorldCharactersButUser(),
        });

        DE.world.initialScenes.push("Default Scene");
        DE.world.metadata = standardApp.buildWorldMetadata({
            theme: { asset: "@assets/worlds/simple-lunar-station/luna.mp3", volume: 1.3 },
        });
        DE.world.name = "Simple Lunar Station";

        DE.world.lore = "The world is set on a small lunar station orbiting the Moon. The station serves as a research outpost and habitat for astronauts and scientists studying the lunar environment. The station is equipped with life support systems, scientific laboratories, living quarters, and communication facilities. Outside the station, the barren surface of the Moon stretches out, dotted with craters and rocks. The sky above is a pitch-black void, with the Earth hanging in the distance. The silence is absolute, broken only by the faint hum of the station's machinery";

        for (let i = 0; i < 2; i++) {
            const letter = String.fromCharCode(65 + i);
            const bedroom = DE.utils.world.newLocation({
                name: "Lunar Station Bedroom " + letter,
                script: engine.script,
                description: "A small, utilitarian bedroom within the lunar station. The room is sparsely furnished with a bunk bed, a small desk, and a locker for personal belongings. A porthole window offers a view of the lunar surface below",
                entrances: [
                    {
                        autoLocks: true,
                        description: "A sturdy door that leads to the common area of the lunar station. The door is made of reinforced metal",
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
                parent: lunarStation.id,
                metadata: standardApp.buildLocationMetadata({
                    asset: "@assets/worlds/simple-lunar-station/bedroom.jpg",
                }),
                state: {},
                temp: {},
            }, () => [
                {
                    name: "Bedroom Area",
                    description: "The bedroom area of the lunar station, featuring a bunk bed, a small desk, and a locker for personal belongings",
                    maxVolumeLiters: 2000,
                    maxWeightKg: 2000,
                    metadata: standardApp.buildLocationSlotMetadata({
                        asset: "@assets/worlds/simple-lunar-station/bedroom_area.jpg",
                    }),
                    state: {},
                    temp: {},
                    items: bunkBedFactory(1),
                },
            ]);

            DE.utils.world.newConnection({
                from: bedroom.id,
                to: lunarStation.id,
                bidirectional: true,
                distanceMeters: 0,
                maxHeightCm: 0,
                maxVolumeLiters: 0,
                maxWeightKg: 0,
                onlyVehicles: false,
                otherPassageConditions: {},
                state: {},
                temp: {},
                vehicleTypes: [],
            });
        }
    },

    onWorldInitialized(DE) {
        DE.utils.characters.newTriggerInAllCharacters({
            type: "yes_no",
            question: (info) => `has ${info.char.name} returned to a pressurized environment successfully?`,
            runIf: (char) => {
                return DE.utils.states.charHasState(char, "Asphyxiating in the Vaccuum")
            },
            onValue: (answer, char) => {
                if (answer) {
                    DE.utils.states.shiftState(char, "Asphyxiating in the Vaccuum", -4, null, null);
                    DE.utils.states.shiftState(char, "Freezing in the Vaccuum", -1, null, null);
                }
            }
        });

        DE.utils.characters.newTriggerInAllCharacters({
            type: "yes_no",
            question: (info) => `has ${info.char.name} put on a space suit?`,
            runIf: (char) => {
                return DE.utils.states.charHasState(char, "Asphyxiating in the Vaccuum") || DE.utils.states.charHasState(char, "Freezing in the Vaccuum");
            },
            onValue: (answer, char) => {
                if (answer) {
                    DE.utils.states.shiftState(char, "Asphyxiating in the Vaccuum", -4, null, null);
                    DE.utils.states.shiftState(char, "Freezing in the Vaccuum", -1, null, null);
                }
            }
        });

        DE.utils.characters.newTriggerInAllCharacters({
            type: "yes_no",
            question: (info) => `has ${info.char.name} taken a hot shower or used a heater?`,
            runIf: (char) => {
                return DE.utils.states.charIsRelievingState(char, "Freezing in the Vaccuum");
            },
            onValue: (answer, char) => {
                if (answer) {
                    DE.utils.states.shiftState(char, "Freezing in the Vaccuum", -2, null, null);
                }
            }
        });

        DE.utils.characters.newTriggerInAllCharacters({
            type: "yes_no",
            question: (info) => `has ${info.char.name} put on a blanket, warm clothes or similar?`,
            runIf: (char) => {
                return DE.utils.states.charIsRelievingState(char, "Freezing in the Vaccuum");
            },
            onValue: (answer, char) => {
                if (answer) {
                    DE.utils.states.shiftState(char, "Freezing in the Vaccuum", -1, null, null);
                }
            },
        });

        DE.utils.characters.defineStateInAllCharacters("Asphyxiating in the Vaccuum", {
            randomSpawnRate: 0,
            permanent: false,
            modifiesStatesIntensitiesOnTrigger: {},
            requiredStates: [],
            requiresCharacterCausants: false,
            requiresObjectCausants: false,
            requiresPosture: null,
            injuryAndDeath: true,
            triggersStates: {},

            // No reasoning required, obviously should get out of the vaccuum
            // what else could it be?
            actionPromptInjection: [
                {
                    action: (info) => `${info.char.name} has an urgent need to return to the airlock and into the lunar station to avoid asphyxiation`,
                    isDeadEndScenario: false,
                    deadEndIsDeath: false,
                    primaryEmotion: "fearful",
                    emotionalRange: [],
                },
            ],
            behaviourType: "BINARY",
            conflictStates: [],
            deadEndIsDeath: true,
            // 30 seconds to death by asphyxiation
            deadEndByTimeInMinutes: 0.5,
            triggersDeadEnd: (info) => `${info.char.name} has run out of air and has asphyxiated in the vacuum of space`,
            intensityChangeRatePerInferenceCycle: 0,
            dominance: 10,
            general: (info) => `${info.char.name} is struggling to breathe in the vacuum of space`,
        });

        DE.utils.characters.defineStateInAllCharacters("Freezing in the Vaccuum", {
            randomSpawnRate: 0,
            permanent: false,
            modifiesStatesIntensitiesOnTrigger: {},
            requiredStates: [],
            requiresCharacterCausants: false,
            requiresObjectCausants: false,
            requiresPosture: null,
            injuryAndDeath: true,
            usesReliefDynamic: true,
            relieving: (info) => `${info.char.name} is recovering from the severe freezing effects of the vacuum of space and should look for warmth`,
            intensityChangeRatePerInferenceCycleAfterRelief: -0.1,
            // need no triggers, the weather system will apply the state
            triggersStates: {},
            actionPromptInjection: [],
            behaviourType: "BINARY",
            conflictStates: [],
            deadEndIsDeath: true,
            // 5 minutes to death by freezing
            deadEndByTimeInMinutes: 5,
            triggersDeadEnd: (info) => `${info.char.name} has succumbed to the extreme cold of the vacuum of space`,
            intensityChangeRatePerInferenceCycle: 0,
            dominance: 10,
            dominanceAfterRelief: 1,
            general: (info) => `${info.char.name} is freezing in the vacuum of space`,
        });
    }
}
