/**
 * @param {string} jsContent
 * @returns {CardTypeCard}
 */
export function createCardStructureFrom(jsContent) {
    /**
     * @type {CardTypeCard}
     */
    const baseFile = {
        config: {},
        card: '',
        imports: [],
        head: [],
        body: [],
        foot: [],
    };

    const splittedLines = jsContent.split('\n');
    const config = splittedLines[0] ? splittedLines[0].startsWith('//@config:') ? JSON.parse(splittedLines[0].replace('//@config:', '').trim()) : {} : {};
    const card = splittedLines[1] ? splittedLines[1].startsWith('//@card:') ? JSON.parse(splittedLines[1].replace('//@card:', '').trim()) : '' : '';
    baseFile.card = card;

    let isInImports = false;
    let isInHead = false;
    let isInBody = false;
    let isInFoot = false;
    for (const line of splittedLines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '//@imports') {
            isInImports = true;
            isInHead = false;
            isInBody = false;
            isInFoot = false;
        } else if (trimmedLine === '//@head') {
            isInImports = false;
            isInHead = true;
            isInBody = false;
            isInFoot = false;
        }  else if (trimmedLine === '//@body') {
            isInImports = false;
            isInHead = false;
            isInBody = true;
            isInFoot = false;
        } else if (trimmedLine === '//@foot') {
            isInImports = false;
            isInHead = false;
            isInBody = false;
            isInFoot = true;
        } else {
            if (isInHead) {
                baseFile.head.push(trimmedLine);
            } else if (isInBody) {
                baseFile.body.push(trimmedLine);
            } else if (isInFoot) {
                baseFile.foot.push(trimmedLine);
            } else if (isInImports) {
                baseFile.imports.push(trimmedLine);
            }
        }
    }

    baseFile.config = config;

    return baseFile;
}

/**
 * @param {CardTypeCard} base
 * @returns {string}
 */
export function getJsCard(base) {
    let endResult = `//@config: ${JSON.stringify(base.config)}` +
        `\n//@card: ${JSON.stringify(base.card)}` + "\n\n";

    const linesInOrder = [
        "//@imports",
        ...base.imports,
        "//@head",
        ...base.head,
        "//@body",
        ...base.body,
        "//@foot",
        ...base.foot,
    ];

    let tabCount = 0;
    for (const line of linesInOrder) {
        const trimmedLine = line.trim();
        let alreadyReduced = false;
        if (trimmedLine.startsWith("}") || trimmedLine.startsWith(")") || trimmedLine.startsWith("]")) {
            tabCount = Math.max(tabCount - 1, 0);
            alreadyReduced = true;
        }
        endResult += "\t".repeat(tabCount) + trimmedLine + "\n";
        if (trimmedLine.endsWith('{') || trimmedLine.endsWith('(') || trimmedLine.endsWith('[')) {
            tabCount++;
        }
        
        if (!alreadyReduced && (trimmedLine.endsWith('}') || trimmedLine.endsWith(')') || trimmedLine.endsWith(']'))) {
            tabCount = Math.max(tabCount - 1, 0);
        }
    }

    return endResult;
}

/**
 * @typedef {Object} CardTypeGuider
 * @property {(question: string, options: string[], defaultValue?: string) => Promise<{value: string}>} askOption
 * @property {(question: string, defaultValue?: string) => Promise<{value: string}>} askOpen
 * @property {(question: string, defaultValue?: number) => Promise<{value: number}>} askNumber
 * @property {(question: string, defaultValue?: boolean) => Promise<{value: boolean}>} askBoolean
 * @property {(question: string, defaultValue?: string[]) => Promise<{value: string[]}>} askList
 */

/**
 * @typedef {Object} CardTypeAutoSave
 * @property {() => Promise<void>} save - A function that saves the current state of the card, for example to a file or database. This can be called after any change is made to the card to ensure that progress is not lost.
 */

/**
 * @typedef {Object} CardTypeCard
 * @property {string} card
 * @property {*} config
 * @property {string[]} head
 * @property {string[]} body
 * @property {string[]} foot
 * @property {string[]} imports
 */


/**
 * 
 * @param {string[]} lines 
 * @param {string} commentId 
 */
export function hasSpecialComent(lines, commentId) {
    return lines.some(line => line.trim() === `//@${commentId}`);
}

/**
 * 
 * @param {string[]} lines 
 * @param {string} commentId 
 */
export function insertSpecialComment(lines, commentId) {
    if (!hasSpecialComent(lines, commentId)) {
        lines.push(`//@${commentId}`);
    }
}