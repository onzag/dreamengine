import { importCharacterFromJSON } from '../imports/characters.js';
import { importWorldFromJSON } from '../imports/world.js';
import fs from 'fs';

const json = JSON.parse(fs.readFileSync('./test-characters/dema-basic.json', 'utf-8'));
const jsonWorld = JSON.parse(fs.readFileSync('./test-worlds/simple-lunar-station.json', 'utf-8'));
const character = importCharacterFromJSON(json);
const world = importWorldFromJSON(jsonWorld);

console.log(world.world);
console.log(character.character);