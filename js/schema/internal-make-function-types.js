import {ALL_FUNCTIONS} from './functions.js';
import fs from 'fs';
import path from 'path';

let dType = "interface FunctionTypes {\n";
for (const [signature, details] of ALL_FUNCTIONS) {
    const parts = signature.split("->");
    const name = parts[0].trim().split(" ")[0];
    const argsPart = parts[0].trim().substring(name.length).trim();
    const returnType = parts[1].trim();
    const args = argsPart.split(" ").filter(a => a.trim().length > 0);
    dType += `${name}(DE: DEObject, char: CompleteCharacterReference, `;
    dType += args.join(", ");
    dType += `): ${returnType};\n`;
}
dType += "}\n";

console.log(dType);
// because of the buggy mess of ES modules you need to set "type": "module" in package.json
// before running this script
fs.writeFileSync(path.join("..", "types", "functypes.d.ts"), dType, 'utf8');