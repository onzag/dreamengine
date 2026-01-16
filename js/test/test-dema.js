import { importCharacterFromJSON } from '../imports/characters.js';
import fs from 'fs';

const json = JSON.parse(fs.readFileSync('./test-characters/dema-basic.json', 'utf-8'));
const character = importCharacterFromJSON(json);

(async () => {
    // @ts-ignore
    character.character.scripts.spawn[0].execute({user: {name: "TestUser"}, functions: {}}, character.character)
    console.log(await character.character.general.execute({user: {name: "TestUser"}, functions: {}}, character.character))
})();