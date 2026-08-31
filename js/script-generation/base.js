/**
 * @param {string} jsContent
 * @returns {ScriptTypeGenerator}
 */
export function parseScriptGeneratorFrom(jsContent) {
    /**
     * @type {ScriptTypeGenerator}
     */
    const baseFile = {
        state: {},
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

    let stateAcumulator = '';

    let isInState = false;

    for (const line of splittedLines) {
        const trimmedLine = line.trim();

        if (!trimmedLine || trimmedLine.startsWith('//@')) {
            if (isInState) {
                try {
                    baseFile.state = JSON.parse(stateAcumulator);
                } catch (e) {
                    console.error("Error parsing state JSON:", e);
                    throw new Error("Error parsing state JSON");
                }
            }
            isInState = false;
        }

        if (trimmedLine === '//@placeholder' || !trimmedLine) {
            // skip
        } if (trimmedLine.startsWith("//") && isInState) {
            // Preserve newlines between continuation lines so that the
            // pretty-printed JSON survives a round-trip byte-for-byte.
            // Concatenating without a separator would collapse multi-line
            // JSON to one line and cause re-encoding to grow the file.
            stateAcumulator += "\n" + line.substring(2);
        } else if (trimmedLine.startsWith('//@state:') && !sectionId) {
            stateAcumulator = line.substring('//@state:'.length).trim();
            isInState = true;
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
                const parsed = parseScriptGeneratorFrom(accumulatedLinesOfSection.join('\n'));
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
                sectionId = null;
                accumulatedLinesOfSection = [];
            } else if (sectionId) {
                accumulatedLinesOfSection.push(line);
            }
        } else {
            if (sectionId) {
                accumulatedLinesOfSection.push(line);
            } else if (isInBody) {
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
export function isScriptTypeGeneratorFile(jsContent) {
    if (jsContent.startsWith("//@placeholder")) {
        return true;
    }
    const splittedLines = jsContent.split('\n');
    const basicChecksPass = splittedLines.length > 2 && splittedLines[0].startsWith('//@state:');
    if (!basicChecksPass) return false;
    // check for imports, head, body or foot comments
    const trimmedLines = splittedLines.map(line => line.trim());
    return trimmedLines.includes('//@imports') || trimmedLines.includes('//@head') || trimmedLines.includes('//@body') || trimmedLines.includes('//@foot');
}

/**
 * @param {ScriptTypeGenerator} base
 * @param {number} baseTabCount
 * @param {boolean} noImportsNorState
 * @param {string[]} commentOutSections - array of section commentIds to comment out in the output
 * @returns {string}
 */
export function getJsScriptFromGenerator(base, baseTabCount = 0, noImportsNorState = false, commentOutSections = []) {
    let endResult = noImportsNorState ? "" : `//@state: ${JSON.stringify(base.state, null, 2).split("\n").join("\n//")}` + "\n\n";

    const elementsInOrder = noImportsNorState ? [
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

            if (!trimmedLine) {
                if (!endResult.endsWith('\n\n')) {
                    endResult += '\n';
                }
                continue;
            }

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
            let sectionJs = getJsScriptFromGenerator({
                state: {},
                imports: [],
                head: element.head,
                body: element.body,
                foot: element.foot,
            }, baseTabCount + tabCount, true);
            const commentOut = commentOutSections.includes(element.commentId);
            if (commentOut) {
                // consider the tabs when comment out
                sectionJs = sectionJs.split('\n').map(line => line.replace(/^(\t*)/, '$1// ')).join('\n');
            }
            endResult += `\t`.repeat(baseTabCount + tabCount) + `//@@${element.commentId}\n` + sectionJs + `\t`.repeat(baseTabCount + tabCount) + `//@@${element.commentId}\n\n`;
        }
    }

    return endResult;
}

/**
 * @typedef {Object} ScriptTypeGuiderOption
 * @property {string} value
 * @property {string} label
 */

/**
 * @typedef {Object} ScriptTypeGuider
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, options: Array<ScriptTypeGuiderOption | string>, defaultValue: string | (() => Promise<string>)) => Promise<{value: string}>} askOption
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, defaultValue: string | (() => Promise<string>)) => Promise<{value: string}>} askOpen
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, defaultValue: string | (() => Promise<string>)) => Promise<{value: string}>} askAccept
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, defaultValue: number | (() => Promise<number>)) => Promise<{value: number}>} askNumber
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, defaultValue: boolean | (() => Promise<boolean>)) => Promise<{value: boolean}>} askBoolean
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, options: Record<string, Array<ScriptTypeGuiderOption | string>> | null, defaultValue: string[] | (() => Promise<string[]>)) => Promise<{value: string[]}>} askList
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, defaultValue: string[] | (() => Promise<string[]>)) => Promise<{value: string[]}>} askArbitraryList
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, defaultValue: string[] | (() => Promise<string[] | null>)) => Promise<{value: string[] | null}>} askAcceptArbitraryList
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, options: {generate: {width: number, height: number, prompt: string, referenceImage: string | null} | null}, defaultValue: string) => Promise<{value: string}>} askImageAsset
 * @property {(id: string | {id: string, reask: boolean, recalcdefault?: boolean, step: boolean} | null, question: string, options: {generate: {duration: number, prompt: string} | null}, defaultValue: string) => Promise<{value: string}>} askAudioAsset
 */

/**
 * @typedef {Object} ScriptTypeGenerator
 * @property {*} state
 * @property {Array<ScriptTypeGeneratorSection | string>} head
 * @property {Array<ScriptTypeGeneratorSection | string>} body
 * @property {Array<ScriptTypeGeneratorSection | string>} foot
 * @property {Array<string>} imports
 */

/**
 * @typedef {Object} ScriptTypeGeneratorSection
 * @property {string} type - The type of the section, e.g. "section"
 * @property {string} commentId - The id of the comment that marks this section, e.g. "base-basics"
 * @property {Array<ScriptTypeGeneratorSection | string>} head
 * @property {Array<ScriptTypeGeneratorSection | string>} body
 * @property {Array<ScriptTypeGeneratorSection | string>} foot
 */

/**
 * 
 * @param {Array<ScriptTypeGeneratorSection | string>} lines 
 * @param {string} commentId 
 * @param {(section: ScriptTypeGeneratorSection) => void} [defaultCreateFn] - Optional function to initialize the section
 */
export function insertSection(lines, commentId, defaultCreateFn) {
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
    if (defaultCreateFn) {
        defaultCreateFn(newSection);
    }
    lines.push(newSection);
    return newSection;
}

/**
 * 
 * @param {Array<ScriptTypeGeneratorSection | string>} lines 
 * @param {string} commentId 
 * @param {(section: ScriptTypeGeneratorSection) => void} [defaultCreateFn] - Optional function to initialize the section
 */
export function unshiftSection(lines, commentId, defaultCreateFn) {
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
    if (defaultCreateFn) {
        defaultCreateFn(newSection);
    }
    lines.unshift(newSection);
    return newSection;
}

/**
 * @param {Array<ScriptTypeGeneratorSection | string>} lines 
 * @param {string} commentId 
 */
export function insertSpecialComment(lines, commentId) {
    const comment = `//@#${commentId}`;
    if (!lines.find(line => typeof line === 'string' && line.trim() === comment.trim())) {
        lines.push(comment);
    }
}

/**
 * @param {Array<ScriptTypeGeneratorSection | string>} lines 
 * @param {string} commentId 
 */
export function unshiftSpecialComment(lines, commentId) {
    const comment = `//@#${commentId}`;
    if (!lines.find(line => typeof line === 'string' && line.trim() === comment.trim())) {
        lines.unshift(comment);
    }
}

/**
 * 
 * @param {Array<ScriptTypeGeneratorSection | string>} lines 
 * @param {string} commentId 
 */
export function hasSpecialComment(lines, commentId) {
    const comment = `//@#${commentId}`;
    return !!lines.find(line => typeof line === 'string' && line.trim() === comment.trim());
}

/**
 * 
 * @param {Array<ScriptTypeGeneratorSection | string>} lines 
 * @param {string} commentId
 * @return {ScriptTypeGeneratorSection | null}
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

/**
 * 
 * @param {string} str 
 * @param {string} charName 
 */
function replaceCharNameWithChar(str, charName) {
    const escapedName = charName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(^|[^\\w])(${escapedName})(?=[^\\w]|$)`, "g");
    return str.replace(regex, "$1{{char}}");
}

/**
 * Converts a plain string with {{placeholder}} syntax into a backtick-wrapped
 * template literal string with specific replacements:
 *   {{char}}        → ${info.char.name}
 *   {{char.x}}      → ${info.char.x}
 *   {{other}}       → ${info.other.name}
 *   {{other.x}}     → ${info.other.x}
 *   {{chars}}       → ${DE.utils.formatAnd(DE, info.chars.map((c) => c.name))}
 *   anything else   → ${"???"}
 *
 * Escapes existing backticks and $ signs so the result is safe
 * to embed directly as a JS template literal.
 * @param {string} str
 * @param {string} charName
 * @returns {string}
 */
export function toTemplateLiteral(str, charName) {
    // Escape backticks and lone ${} that aren't our placeholders
    let escaped = replaceCharNameWithChar(str, charName).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\n/g, '\\n');
    // Replace {{...}} with specific expansions
    escaped = escaped.replace(/\{\{(.+?)\}\}/g, (_, key) => {
        if (key === 'char') return '${info.char.name}';
        if (key.startsWith('char.')) return '${info.' + key + '}';
        if (key === 'other') return '${info.other.name}';
        if (key.startsWith('other.')) return '${info.' + key + '}';
        if (key === 'chars') return '${DE.utils.formatAnd(DE, info.chars.map((c) => c.name))}';
        if (key === 'other_family_relation') return '${info.otherFamilyRelation}';
        if (key === 'other_relationship') return '${info.otherRelationship}';
        return '${"???"}';
    });
    return '`' + escaped + '`';
}

/**
 * Converts a plain string with {{placeholder}} syntax into a backtick-wrapped
 * template literal string with specific replacements:
 *   {{char}}        → ${info.char.name}
 *   {{char.x}}      → ${info.char.x}
 *   {{other}}       → ${info.other.name}
 *   {{other.x}}     → ${info.other.x}
 *   {{chars}}       → ${DE.utils.formatAnd(DE, info.chars.map((c) => c.name))}
 *   anything else   → ${"???"}
 *
 * Escapes existing backticks and $ signs so the result is safe
 * to embed directly as a JS template literal.
 * @param {string} str
 * @param {string} charName
 * @returns {string}
 */
export function toTemplateLiteralNoInfo(str, charName) {
    // Escape backticks and lone ${} that aren't our placeholders
    let escaped = replaceCharNameWithChar(str, charName).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\n/g, '\\n');
    // Replace {{...}} with specific expansions
    escaped = escaped.replace(/\{\{(.+?)\}\}/g, (_, key) => {
        if (key === 'char') return '${char.name}';
        if (key === 'other') return '${other.name}';
        return '${"???"}';
    });
    return '`' + escaped + '`';
}