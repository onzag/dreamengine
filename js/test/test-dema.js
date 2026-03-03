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
    host: "wss://95.133.253.99:8765",
    // used for development
    secret: "5b381d365a529c44aae7944d6fdcc4ee83b90170f020c885faa60c5b906540029c4d2fb07d2efb57ef434ca61ab7916f486e3e2bdd2f92d5f69a5363d11b6232",
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
    capacityKg: 0,
    capacityLiters: 0,
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
        addedCarryingCapacityKg: 0,
        addedCarryingCapacityLiters: 0,
        extraBodyVolumeWhenWornLiters: 1,
    },
    descriptionWhenContainingCharacter: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    name: "Space Clothes",
    owner: "Onza",
    properties: {},
    placement: "worn",
    volumeLiters: 1,
    weightKg: 2,
    communicator: null,
    madeOf: [],
}
// @ts-expect-error
engine.deObject.stateFor["Onza"].wearing = [
    clothes,
];

engine.setScriptImportResolver(nodejsImportResolver);
engine.setCharacterImportResolver(nodejsCharacterImportResolver);

// debug speedups
engine.setWorldRulesDisabled(true);

try {
    await engine.initializeWorld();
} catch (err) {
    console.error("Error initializing world:", err);
    process.exit(1);
}

const ui = new TextOnlyUI(engine, "Onza");
ui.run();