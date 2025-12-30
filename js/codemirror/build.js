import { basicSetup } from "codemirror"
import { handlebarsLanguage } from "@xiechao/codemirror-lang-handlebars"
import { indentWithTab } from "@codemirror/commands"
import { EditorView, keymap, placeholder, MatchDecorator } from "@codemirror/view"
import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import { javascriptLanguage } from "@codemirror/lang-javascript";
import * as tsvfs from "@typescript/vfs";
import ts from 'typescript';
import { linter } from '@codemirror/lint';
import { autocompletion } from '@codemirror/autocomplete';

window.EditorView = EditorView;
window.basicSetup = basicSetup;
window.handlebarsLanguage = handlebarsLanguage;
window.indentWithTab = indentWithTab;
window.keymap = keymap;
window.placeholder = placeholder;
window.javascriptLanguage = javascriptLanguage;
window.TVSFS_ENV = null;
window.linter = linter;
window.autocompletion = autocompletion;
window.ViewPlugin = ViewPlugin;
window.tsvfsViewPlugin = (editorContainer) => ViewPlugin.fromClass(
    class {
        update() {
            window.TVSFS_ENV.updateFile('index.ts', editorContainer.editor.state.doc.toString() || ' ');
        }
    }
)

const REQUIRED_LIBS = [
    "lib.d.ts",
    "lib.es2020.d.ts",
    "lib.decorators.d.ts",
    "lib.decorators.legacy.d.ts",
    "lib.es5.d.ts"
]

let IS_TVSFS_INITIALIZED = false;
async function initializeTVSFS(globalsDefinitions) {
    if (IS_TVSFS_INITIALIZED) return;
    const fsMap = new Map();
    for (const libName of REQUIRED_LIBS) {
        const fileText = await fetch("../tslib/" + libName).then(res => res.text());
        fsMap.set("/" + libName, fileText);
    }
    fsMap.set('index.ts', ' ');
    fsMap.set('globals.d.ts', globalsDefinitions);

    const system = tsvfs.createSystem(fsMap);
//    try {
    const env = tsvfs.createVirtualTypeScriptEnvironment(
        system,
        ['index.ts', 'globals.d.ts'],
        ts,
    );
//} catch (e) {
//    debugger;
//    console.error("Error initializing TVSFS:", e);
//}
    window.TVSFS_ENV = env;
    IS_TVSFS_INITIALIZED = true;
}
window.initializeTVSFS = initializeTVSFS;

// displays errors
function tsErrorLinter() {
    const tsErrors = window.TVSFS_ENV.languageService
        .getSemanticDiagnostics('index.ts')
        .concat(window.TVSFS_ENV.languageService.getSyntacticDiagnostics('index.ts'))

        // remove await errors at top level
        .filter((c) => c.code !== 1378 && c.code !== 1375 && c.code !== 1108);
    return tsErrors.map((tsError) => ({
        from: tsError.start,
        to: tsError.start + tsError.length,
        severity: 'error',
        message: "[" + tsError.code + ']: ' + (
            typeof tsError.messageText === 'string'
                ? tsError.messageText
                : tsError.messageText.messageText
            ),
    }));
}
window.tsErrorLinter = tsErrorLinter;

function isAlpha(char) {
    return /^[A-Z]$/i.test(char);
}

// displays autocompletes
function tsComplete(ctx) {
    let tsCompletions = window.TVSFS_ENV.languageService.getCompletionsAtPosition(
        'index.ts',
        ctx.pos,
        {}
    );

    if (!tsCompletions) return { from: ctx.pos, options: [] };

    const text = ctx.state.doc.toString();

    let lastWord, from;
    let lastChar;
    let lastCharIndex = -1;
    for (let i = ctx.pos - 1; i >= 0; i--) {
        if (([' ', '.', '\n', ':', '{'].includes(text[i]) || i === 0) && typeof lastWord === 'undefined') {
            from = i === 0 ? i : i + 1;
            lastWord = text.slice(from, ctx.pos).trim();
        }
        if (text[i] !== ' ' && text[i] !== "\n" && typeof lastChar === 'undefined') {
            lastChar = text[i];
            lastCharIndex = i;
        }
        if (typeof lastWord !== 'undefined' && typeof lastChar !== 'undefined') {
            break;
        }
    }

    if (lastWord) {
        tsCompletions.entries = tsCompletions.entries.filter((completion) =>
            completion.name.startsWith(lastWord)
        );
    } else {
        if (lastChar && ['(', '{', "=", ":", ")", "]", "}"].includes(lastChar)) {
            tsCompletions.entries = [];
        } else if (lastCharIndex > 0 && isAlpha(lastChar)) {
            // let's try to find a potential keyword before this last char
            let potentialWord = lastChar;
            for (let i = lastCharIndex - 1; i >= 0; i--) {
                if (isAlpha(text[i])) {
                    potentialWord = text[i] + potentialWord;
                } else {
                    break;
                }
            }
            if (["async", "await", "return", "class", "function", "const", "let", "var", "if"].includes(potentialWord)) {
                tsCompletions.entries = []
            }
        }
    }

    //console.log(lastWord, tsCompletions);
    //debugger;

    return {
        from: ctx.pos, // Autocomplete position
        options: tsCompletions.entries.map((completion) => ({
            label: completion.name,
            apply: (view) => {
                view.dispatch({
                    changes: { from, to: ctx.pos, insert: completion.name },
                });
            },
        })),
    };
}
window.tsComplete = tsComplete;

class SpecialKeywordWidget extends WidgetType {
    constructor(placeholderText) {
        super();
        this.placeholderText = placeholderText;
    }
    toDOM() {
        const span = document.createElement("span");
        span.className = "cm-specialkeyword";
        span.textContent = this.placeholderText;
        return span;
    }
    ignoreEvent() {
        return false;
    }
}

window.getMatchDecorator = (all_keywords_str_list) => {
    const specialKeywordMatcher = new MatchDecorator({
        regexp: new RegExp(`\\b(${all_keywords_str_list.join('|')})\\b`, 'g'),
        decoration: match => Decoration.replace({
            widget: new SpecialKeywordWidget(match[1]),
        })
    });

    const specials = ViewPlugin.fromClass(class {
        constructor(view) {
            this.specials = specialKeywordMatcher.createDeco(view)
        }
        update(update) {
            this.specials = specialKeywordMatcher.updateDeco(update, this.specials)
        }
    }, {
        decorations: instance => instance.specials,
    });

    return specials;
}

window.convertTsToJs = (tsCode) => {
    const result = ts.transpileModule(tsCode, {
        compilerOptions: {
            // Preserve modern syntax; only strip types
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            // Avoid runtime transforms
            experimentalDecorators: false,
            emitDecoratorMetadata: false,
            useDefineForClassFields: false,
            // Remove type-only imports, keep value imports intact
            importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
            // Keep comments and formatting as much as possible
            removeComments: false,
            newLine: ts.NewLineKind.LineFeed,
            sourceMap: false,
        },
        reportDiagnostics: false,
    });
    return result.outputText;
}