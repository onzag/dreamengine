import { DEngine } from '../engine/index.js';
import { TextOnlyUI } from '../textonlyapp/ui.js';
import { InferenceAdapterLlamaUncensored } from "../engine/inference/adapter-de-server-uncensored.js";
import { DEJSEngine } from '../jsengine/index.js';
import { localResolver } from '../jsengine/local-resolver.js';

if (typeof process !== "undefined" && process.versions && process.versions.node) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const engine = new DEngine();
const jsEngine = new DEJSEngine(engine, localResolver);
await jsEngine.addScripts([
    { namespace: "worlds", id: "simple-lunar-station" },
    { namespace: "characters", id: "dema-basic" },
    { namespace: "testing", id: "states" },
]);

const inferenceAdapter = new InferenceAdapterLlamaUncensored(engine, {
    // host: "wss://95.133.252.166:8765",
    host: "wss://localhost:8765",
    // used for development
    secret: "dev-secret-12345678900abcdef",
});

await engine.initialize({
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
    perception: 0.6,
    stealth: 0.5,
    tier: "human",
    tierValue: 50,
    powerGrowthRate: 0.25,
});

engine.getDEObject().stateFor["Dema"].location = "Lunar Station";
engine.getDEObject().stateFor["Dema"].locationSlot = "Common Area";

/**
 * @type {DEItem}
 */
const clothes = {
    amount: 1,
    description: "A single set of space clothing",
    consumableProperties: null,
    containing: [
        {
            amount: 1,
            name: "Bubble gum stick",
            properties: {},
            volumeLiters: 0.01,
            weightKg: 0.01,
            containing: [],
            ontop: [],
            containingCharacters: [],
            maxVolumeOnTopLiters: 0,
            maxWeightOnTopKg: 0,
            ontopCharacters: [],
            wearableProperties: null,
            containerProperties: null,
            description: "A brand new stick of bubble gum. It looks delicious.",
            isConsumable: true,
            isSeeThrough: false,
            owner: null,
        }
    ],
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
}

engine.getDEObject().stateFor["Onza"].wearing = [
    clothes,
];

const MASSIVE_DUMBELL_TEST = false;
const STICKS_TEST = false;
const GIANT_BOX_TEST = true;
const TIGHT_CLOTHING_TEST = false;

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
}

const giantBox = {
    amount: 1,
    description: "A giant box that can be used for various purposes.",
    isConsumable: false,
    isSeeThrough: false,
    name: "Giant Box",
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
}

// debug speedups
// engine.setWorldRulesDisabled(true);

if (GIANT_BOX_TEST) {
    // @ts-expect-error
    engine.deObject.stateFor["Dema"].carrying.push(giantBox);
}

if (STICKS_TEST) {
    // @ts-expect-error
    engine.deObject.stateFor["Dema"].carrying.push(sticks);
}

if (MASSIVE_DUMBELL_TEST) {
    // @ts-expect-error
    engine.deObject.stateFor["Dema"].carrying.push(massiveDumbell);
}

if (TIGHT_CLOTHING_TEST) {
    // @ts-ignore
    clothes.wearableProperties.volumeRangeMaxLiters = 30;
    // @ts-ignore
    clothes.wearableProperties.volumeRangeMinLiters = 30;
}

const ui = new TextOnlyUI(engine, "Onza");
ui.run();