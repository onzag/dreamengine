import { importCharacterFromJSON } from '../imports/characters.js';
import { importWorldFromJSON } from '../imports/world.js';
import { DEngine } from '../engine/index.js';
import fs from 'fs';
import { nodejsImportResolver } from '../imports/import-resolvers-node.js';

const json = JSON.parse(fs.readFileSync('./test-characters/dema-basic.json', 'utf-8'));
const jsonWorld = JSON.parse(fs.readFileSync('../default-worlds/simple-lunar-station.json', 'utf-8'));
const character = importCharacterFromJSON(json);
const world = importWorldFromJSON(jsonWorld);

const engine = new DEngine();
engine.initialize({
    ageYears: 30,
    carryingCapacityKg: 20,
    carryingCapacityLiters: 20,
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
}, world.world, world.scriptSources)
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
    coversNakedness: true,
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

engine.addCharacter(character.character, character.scriptSources);
engine.setScriptImportResolver(nodejsImportResolver)

await engine.initializeWorld();