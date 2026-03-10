import { importWorldFromJSON } from '../imports/world.js';
import { DEngine } from '../engine/index.js';
import fs from 'fs';
import { nodejsImportResolver, nodejsCharacterImportResolver } from '../imports/import-resolvers-node.js';
import { TextOnlyUI } from '../textonlyapp/ui.js';
import { InferenceAdapterLlamaUncensored } from "../engine/inference/adapter-llama-uncensored.js";

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const jsonWorld = JSON.parse(fs.readFileSync('../default-worlds/simple-lunar-station.json', 'utf-8'));
const world = importWorldFromJSON(jsonWorld);

const engine = new DEngine();
const inferenceAdapter = new InferenceAdapterLlamaUncensored(engine, {
    // host: "wss://95.133.252.166:8765",
    host: "ws://localhost:8765",
    // used for development
    secret: "dev-secret-12345678900abcdef",
});
engine.setInferenceAdapter(inferenceAdapter);
engine.initialize({
    ageYears: 30,
    carryingCapacityKg: 30,
    carryingCapacityLiters: 100,
    gender: "male",
    heightCm: 180,
    weightKg: 75,
    locomotionSpeedMetersPerSecond: 1.4,
    maintenanceCaloriesPerDay: 2500,
    maintenanceHydrationLitersPerDay: 3.0,
    name: "Onza",
    rangeMeters: 500,
    sex: "male",
    shortDescription: "A human male in decent physical condition",
    shortDescriptionTopNakedAdd: "He is currently not wearing a shirt revealing a well-toned upper body",
    shortDescriptionBottomNakedAdd: "He is currently not wearing any pants or underwear",
}, world.world, world.scriptSources, [
    {
        "import": "dema-basic.json",
        "properties": {},
        "spawnLocations": [
            "Lunar Station",
        ],
        "spawnLocationSlots": ["Common Area"],
        "spawnSpreadToChildrenLocations": false,
        "instances": 1,
        "name": "Dema",
    }
])
/**
 * @type {DEItem}
 */
const clothes = {
    amount: 1,
    description: "A single set of space clothing",
    consumableProperties: null,
    containing: [],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 10,
    maxWeightOnTopKg: 1000,
    ontopCharacters: [],
    wearableProperties: {
        coversTopNakedness: true,
        coversBottomNakedness: true,
        volumeRangeMinLiters: 70,
        volumeRangeMaxLiters: 90,
        volumeRangeFlexibilityLeewayLoose: 20,
        volumeRangeFlexibilityLeewaySnug: 10,
        otherFitmentTraitsLoose: ["comfortable", "baggy"],
        otherFitmentTraitsSnug: ["restricts movement"],
        addedCarryingCapacityKg: 0,
        addedCarryingCapacityLiters: 0,
        extraBodyVolumeWhenWornLiters: 1,
    },
    isConsumable: false,
    isSeeThrough: false,
    name: "Space Clothes",
    owner: "Onza",
    properties: {},
    volumeLiters: 1,
    weightKg: 2,
    communicator: null,
    madeOf: [],
}
// @ts-expect-error
engine.deObject.stateFor["Onza"].wearing = [
    clothes,
];

const MASSIVE_DUMBELL_TEST = false;
const STICKS_TEST = false;
const WEIRD_BOX_TEST = true;

/**
 * @type {DEItem}
 */
const massiveDumbell = {
    amount: 1,
    description: "A massive dumbell meant for testing the limits of carrying capacity of a character. It is very heavy and bulky, and not meant to be easily carried.",
    isConsumable: false,
    isSeeThrough: false,
    name: "Massive Dumbell",
    consumableProperties: null,
    containing: [],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 0,
    maxWeightOnTopKg: 0,
    ontopCharacters: [],
    wearableProperties: null,
    owner: "Onza",
    properties: {},
    volumeLiters: 100,
    weightKg: 150,
    communicator: null,
    madeOf: [],
}

const sticks = {
    amount: 100,
    description: "A sturdy stick that can be used for various purposes.",
    isConsumable: false,
    isSeeThrough: false,
    name: "Stick",
    consumableProperties: null,
    containing: [],
    ontop: [],
    containingCharacters: [],
    maxVolumeOnTopLiters: 0,
    maxWeightOnTopKg: 0,
    ontopCharacters: [],
    wearableProperties: null,
    owner: "Onza",
    properties: {},
    volumeLiters: 10,
    weightKg: 1.5,
    communicator: null,
    madeOf: [],
}

const weirdBox = {
    amount: 1,
    description: "A weird box that can be used for various purposes.",
    isConsumable: false,
    isSeeThrough: false,
    name: "Weird Box",
    consumableProperties: null,
    containing: [],
    ontop: [],
    containingCharacters: [
        "Onza",
    ],
    maxVolumeOnTopLiters: 0,
    maxWeightOnTopKg: 0,
    ontopCharacters: [],
    wearableProperties: null,
    owner: null,
    properties: {},
    volumeLiters: 50,
    weightKg: 50,
    communicator: null,
    madeOf: [],
}

engine.setScriptImportResolver(nodejsImportResolver);
engine.setCharacterImportResolver(nodejsCharacterImportResolver);

// debug speedups
// engine.setWorldRulesDisabled(true);

try {
    await engine.initializeWorld();
} catch (err) {
    console.error("Error initializing world:", err);
    process.exit(1);
}

if (WEIRD_BOX_TEST) {
    // @ts-expect-error
    engine.deObject.stateFor["Onza"].beingCarriedByCharacter = "Dema";
    // @ts-expect-error
    engine.deObject.stateFor["Dema"].carrying.push(weirdBox);
    // @ts-expect-error
    engine.deObject.stateFor["Dema"].carryingCharacters.push("Onza");
}

if (STICKS_TEST) {
    // @ts-expect-error
    engine.deObject.stateFor["Dema"].carrying.push(sticks);
}

if (MASSIVE_DUMBELL_TEST) {
    // @ts-expect-error
    engine.deObject.stateFor["Dema"].carrying.push(massiveDumbell);
}

const ui = new TextOnlyUI(engine, "Onza");
ui.run();