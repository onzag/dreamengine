import {ALL_FUNCTIONS} from './functions.js';
import fs from 'fs';
import path from 'path';

let dType = "interface FunctionTypes {\n";
for (const [signature, details, returndesc] of ALL_FUNCTIONS) {
    const parts = signature.split("->");
    const name = parts[0].trim().split(" ")[0];
    const argsPart = parts[0].trim().substring(name.length).trim();
    const returnType = parts[1].trim();
    const args = argsPart.split(" ").filter(a => a.trim().length > 0);
    const docString = "/**\n  " + details + "\n  @returns " + returndesc + "\n*/\n";
    dType += `${docString}${name}(DE: DEObject, char: CompleteCharacterReference, `;
    dType += args.join(", ");
    dType += `): ${returnType};\n`;
}
dType += "}\n";

console.log(dType);
fs.writeFileSync(path.join("..", "types", "functypes.d.ts"), dType, 'utf8');