/**
 * 
 * @param {string} jsContent
 */
export function createCardStructureFrom(jsContent) {
    /**
     * @type {{contents: string, card: string, config: *, head: string[], body: string[], foot: string[], imports: string[]}}
     */
    const baseFile = {
        contents: jsContent,
        config: {},
        card: '',
        imports: [],
        head: [],
        body: [],
        foot: [],
    };

    const splittedLines = jsContent.split('\n');
    const config = splittedLines[0] ? splittedLines[0].startsWith('// config:') ? JSON.parse(splittedLines[0].replace('// config:', '').trim()) : {} : {};
    const card = splittedLines[1] ? splittedLines[1].startsWith('// card:') ? JSON.parse(splittedLines[1].replace('// card:', '').trim()) : '' : '';
    baseFile.card = card;

    let isInImports = true;
    let isInHead = false;
    let isInBody = false;
    let isInFoot = false;
    for (const line of splittedLines) {
        if (line.trim() === '// imports') {
            isInImports = true;
            isInHead = false;
            isInBody = false;
            isInFoot = false;
        } else if (line.trim() === '// head') {
            isInImports = false;
            isInHead = true;
            isInBody = false;
            isInFoot = false;
        }  else if (line.trim() === '// body') {
            isInImports = false;
            isInHead = false;
            isInBody = true;
            isInFoot = false;
        } else if (line.trim() === '// foot') {
            isInImports = false;
            isInHead = false;
            isInBody = false;
            isInFoot = true;
        } else {
            if (isInHead) {
                baseFile.head.push(line);
            } else if (isInBody) {
                baseFile.body.push(line);
            } else if (isInFoot) {
                baseFile.foot.push(line);
            } else if (isInImports) {
                baseFile.imports.push(line);
            }
        }
    }

    baseFile.config = config;

    return baseFile;
}

/**
 * @param {{contents: string, card: string, config: *, head: string[], body: string[], foot: string[], imports: string[]}} base 
 */
export function getJsCard(base) {
    let endResult = `// config: ${JSON.stringify(base.config)}` +
        `\n// card: ${JSON.stringify(base.card)}` + "\n\n";

    const linesInOrder = [
        "// imports",
        ...base.imports,
        "// head",
        ...base.head,
        "// body",
        ...base.body,
        "// foot",
        ...base.foot,
    ];

    let tabCount = 0;
    for (const line of linesInOrder) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("}") || trimmedLine.startsWith(")") || trimmedLine.startsWith("]")) {
            tabCount = Math.max(tabCount - 1, 0);
        }
        endResult += "\t".repeat(tabCount) + trimmedLine + "\n";
        if (trimmedLine.endsWith('{') || trimmedLine.endsWith('(') || trimmedLine.endsWith('[')) {
            tabCount++;
        }
        
        if (trimmedLine.endsWith('}') || trimmedLine.endsWith(')') || trimmedLine.endsWith(']')) {
            tabCount = Math.max(tabCount - 1, 0);
        }
    }

    return endResult;
}