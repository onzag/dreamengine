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

    if (jsContent.startsWith("//@placeholder")) {
        return baseFile;
    }

    const splittedLines = jsContent.split('\n');

    let isInImports = false;
    let isInHead = false;
    let isInBody = false;
    let isInFoot = false;
    /**
     * @type {Array<string>}
     */
    let accumulatedLinesOfSection = [];
    /**
     * @type {string | null}
     */
    let sectionId = null;
    for (const line of splittedLines) {
        const trimmedLine = line.trim();
        if (trimmedLine === '//@placeholder') {
            // skip
        } else if (trimmedLine.startsWith('//@config:') && !sectionId) {
            baseFile.config = JSON.parse(line.replace('//@config:', '').trim());
        } else if (trimmedLine.startsWith('//@card:') && !sectionId) {
            baseFile.card = JSON.parse(line.replace('//@card:', '').trim());
        } else if (trimmedLine === '//@imports' && !sectionId) {
            isInImports = true;
            isInHead = false;
            isInBody = false;
            isInFoot = false;
        } else if (trimmedLine === '//@head' && !sectionId) {
            isInImports = false;
            isInHead = true;
            isInBody = false;
            isInFoot = false;
        } else if (trimmedLine === '//@body' && !sectionId) {
            isInImports = false;
            isInHead = false;
            isInBody = true;
            isInFoot = false;
        } else if (trimmedLine === '//@foot' && !sectionId) {
            isInImports = false;
            isInHead = false;
            isInBody = false;
            isInFoot = true;
        } else if (trimmedLine.startsWith('//@@')) {
            const foundSectionId = trimmedLine.replace('//@@', '').trim();
            if (!sectionId && foundSectionId) {
                sectionId = foundSectionId;
                accumulatedLinesOfSection = [];
            } else if (sectionId && foundSectionId === sectionId) {
                const parsed = createCardStructureFrom(accumulatedLinesOfSection.join('\n'));
                const section = {
                    type: 'section',
                    commentId: sectionId,
                    head: parsed.head,
                    body: parsed.body,
                    foot: parsed.foot,
                };

                if (isInBody) {
                    baseFile.body.push(section);
                } else if (isInHead) {
                    baseFile.head.push(section);
                } else if (isInFoot) {
                    baseFile.foot.push(section);
                }
            }
        } else {
            if (isInBody) {
                baseFile.body.push(line.trim());
            } else if (isInHead) {
                baseFile.head.push(line.trim());
            } else if (isInFoot) {
                baseFile.foot.push(line.trim());
            } else if (isInImports) {
                baseFile.imports.push(line.trim());
            }
        }
    }

    return baseFile;
}

/**
 * 
 * @param {string} jsContent 
 * @returns {boolean}
 */
export function isCardTypeFile(jsContent) {
    if (jsContent.startsWith("//@placeholder")) {
        return true;
    }
    const splittedLines = jsContent.split('\n');
    const basicChecksPass = splittedLines.length > 2 && splittedLines[0].startsWith('//@config:') && splittedLines[1].startsWith('//@card:');
    if (!basicChecksPass) return false;
    // check for imports, head, body or foot comments
    const trimmedLines = splittedLines.map(line => line.trim());
    return trimmedLines.includes('//@imports') || trimmedLines.includes('//@head') || trimmedLines.includes('//@body') || trimmedLines.includes('//@foot');
}

/**
 * @param {CardTypeCard} base
 * @param {number} baseTabCount
 * @param {boolean} noImports
 * @returns {string}
 */
export function getJsCard(base, baseTabCount = 0, noImports = false) {
    let endResult = `//@config: ${JSON.stringify(base.config)}` +
        `\n//@card: ${JSON.stringify(base.card)}` + "\n\n";

    const elementsInOrder = noImports ? [
        "//@head",
        ...base.head,
        "//@body",
        ...base.body,
        "//@foot",
        ...base.foot,
    ] : [
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
    for (const element of elementsInOrder) {
        if (typeof element === 'string') {
            const trimmedLine = element.trim();
            let alreadyReduced = false;
            if (trimmedLine.startsWith("}") || trimmedLine.startsWith(")") || trimmedLine.startsWith("]")) {
                tabCount = Math.max(tabCount - 1, 0);
                alreadyReduced = true;
            }
            endResult += "\t".repeat(tabCount + baseTabCount) + trimmedLine + "\n";
            if (trimmedLine.endsWith('{') || trimmedLine.endsWith('(') || trimmedLine.endsWith('[')) {
                tabCount++;
            }

            if (!alreadyReduced && (trimmedLine.endsWith('}') || trimmedLine.endsWith(')') || trimmedLine.endsWith(']'))) {
                tabCount = Math.max(tabCount - 1, 0);
            }
        } else {
            // it's a section
            const sectionJs = getJsCard({
                config: {},
                card: '',
                imports: [],
                head: element.head,
                body: element.body,
                foot: element.foot,
            }, baseTabCount + tabCount, true);
            endResult += `\t`.repeat(baseTabCount + tabCount) + `//@@${element.commentId}\n` + sectionJs + `\t`.repeat(baseTabCount + tabCount) + `//@@${element.commentId}\n\n`;
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
 * @property {Array<CardTypeCardSection | string>} head
 * @property {Array<CardTypeCardSection | string>} body
 * @property {Array<CardTypeCardSection | string>} foot
 * @property {Array<string>} imports
 */

/**
 * @typedef {Object} CardTypeCardSection
 * @property {string} type - The type of the section, e.g. "section"
 * @property {string} commentId - The id of the comment that marks this section, e.g. "base-basics"
 * @property {Array<CardTypeCardSection | string>} head
 * @property {Array<CardTypeCardSection | string>} body
 * @property {Array<CardTypeCardSection | string>} foot
 */

/**
 * 
 * @param {Array<CardTypeCardSection | string>} lines 
 * @param {string} commentId 
 */
export function insertSection(lines, commentId) {
    const existingSection = getSection(lines, commentId);
    if (existingSection) {
        return existingSection;
    }
    const newSection = {
        type: 'section',
        commentId,
        head: [],
        body: [],
        foot: [],
    };
    lines.push(newSection);
    return newSection;
}

/**
 * 
 * @param {Array<CardTypeCardSection | string>} lines 
 * @param {string} commentId 
 */
export function insertSpecialComment(lines, commentId) {
    const comment = `//@#${commentId}`;
    if (!lines.find(line => typeof line === 'string' && line.trim() === comment.trim())) {
        lines.push(comment);
    }
}

// TODO remove this is for the buggy mess of web workers
export function hasSpecialComent(){

}

export function unshiftSpecialComment() {
}

/**
 * 
 * @param {Array<CardTypeCardSection | string>} lines 
 * @param {string} commentId 
 */
export function hasSpecialComment(lines, commentId) {
    const comment = `//@#${commentId}`;
    return !!lines.find(line => typeof line === 'string' && line.trim() === comment.trim());
}

/**
 * 
 * @param {Array<CardTypeCardSection | string>} lines 
 * @param {string} commentId
 * @return {CardTypeCardSection | null}
 */
export function getSection(lines, commentId) {
    const found = lines.find(line => {
        if (typeof line === 'string') {
            return false;
        } else if (typeof line === 'object' && line.type === 'section' && line.commentId === commentId) {
            return true;
        }
        return false;
    });
    // @ts-ignore
    return found || null;
}