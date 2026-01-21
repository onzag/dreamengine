import { importWorldFromJSON } from '../imports/world.js';
import { DEngine } from '../engine/index.js';
import fs from 'fs';
import { nodejsImportResolver, nodejsCharacterImportResolver } from '../imports/import-resolvers-node.js';
import { TextOnlyUI } from '../textonlyapp/ui.js';

const jsonWorld = JSON.parse(fs.readFileSync('../default-worlds/simple-lunar-station.json', 'utf-8'));
const world = importWorldFromJSON(jsonWorld);

const engine = new DEngine();
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
    shortDescriptionNaked: "A naked human male in decent physical condition",
}, world.world, world.scriptSources, world.characters)
/**
 * @type {DEItem}
 */
const clothes = {
    amount: 1,
    canLieOn: false,
    canSitOn: false,
    capacityKg: 0,
    capacityLiters: 0,
    description: "A single set of space clothing",
    compartimentName: null,
    consumableProperties: null,
    containing: [],
    wearableProperties: {
        coversNakedness: true,
        volumeRangeMinLiters: 70,
        volumeRangeMaxLiters: 90,
        addedCarryingCapacityKg: 0,
        addedCarryingCapacityLiters: 0,
        extraBodyVolumeWhenWornLiters: 1,
    },
    descriptionWhenCarried: null,
    descriptionWhenWorn: null,
    isConsumable: false,
    isSeeThrough: false,
    name: "Space Clothes",
    nonPickable: false,
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

engine.setScriptImportResolver(nodejsImportResolver)
engine.setCharacterImportResolver(nodejsCharacterImportResolver)

await engine.initializeWorld();

const ui = new TextOnlyUI(engine, "Onza");
ui.run();