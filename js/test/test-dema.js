import { importCharacterFromJSON } from '../imports/characters.js';
import fs from 'fs';

const json = JSON.parse(fs.readFileSync('./test-characters/dema-basic.json', 'utf-8'));
const character = importCharacterFromJSON(json);

(async () => {
    // @ts-ignore
    console.log(character.character.scripts);
    character.character.scripts.spawn['?SCRIPT_Dema_SPAWN_SCRIPT'].execute({user: {name: "TestUser"}, functions: {}}, character.character)
    console.log(await character.character.general.execute({user: {name: "TestUser"}, functions: {}}, character.character))
    console.log(await character.character.properties.IS_ROBOT.value({user: {name: "TestUser"}, functions: {}}, character.character))
    console.log(character.scriptSources);
})();