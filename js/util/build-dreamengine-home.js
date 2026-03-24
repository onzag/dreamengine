/**
 * This script looks at the .dreamengine home directory and creates it if it doesn't exist
 * then will create the following files:
 * 
 * 1. .dreamengine/jsconfig.json - a jsconfig that includes the .dreamengine/types directory for type checking and intellisense in VSCode
 * 2. scripts/ folder, empty if it doesn't exist, where users can put their own scripts that will override the default ones
 * 3. assets/ folder, empty if it doesn't exist, where users can put their own assets that will be used by the engine
 * 4. it will call build-types.js to generate the types and put them in .dreamengine/types, and also put a script in the home directory to update the types easily
 * 
 * This script is meant to be run from the command line and is also called by the engine on startup to ensure the home directory is set up correctly.
 * 
 * This will only build remote types
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const fsPromises = fs.promises;
const localDEPathAtHomeDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dreamengine');

const jsConfig = `
{
  "compilerOptions": {
    "module": "esnext",
    "checkJs": true,
    "strict": true,
    "moduleResolution": "node",
    "target": "es2020"
  },
  "typeAcquisition": {"enable": true},
  "include": ["**/*.js", "types/**/*.d.ts"]
}
`;

export async function buildDreamEngineHome() {
    // Ensure the home directory exists
    await fsPromises.mkdir(localDEPathAtHomeDir, { recursive: true });

    // 1. Write jsconfig.json
    const jsconfigPath = path.join(localDEPathAtHomeDir, 'jsconfig.json');
    await fsPromises.writeFile(jsconfigPath, jsConfig.trim(), 'utf-8');
    console.log(`Wrote jsconfig.json to ${jsconfigPath}`);

    // 2. Create scripts/ folder
    const scriptsDir = path.join(localDEPathAtHomeDir, 'scripts');
    await fsPromises.mkdir(scriptsDir, { recursive: true });
    console.log(`Ensured scripts/ exists at ${scriptsDir}`);

    // 3. Create assets/ folder
    const assetsDir = path.join(localDEPathAtHomeDir, 'assets');
    await fsPromises.mkdir(assetsDir, { recursive: true });
    console.log(`Ensured assets/ exists at ${assetsDir}`);
}

// Allow running directly from CLI
const isMain = process.argv[1] &&
    path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
    buildDreamEngineHome().catch(err => {
        console.error('Failed to set up .dreamengine home:', err);
        process.exit(1);
    });
}