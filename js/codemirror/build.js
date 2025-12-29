import { basicSetup } from "codemirror"
import { handlebarsLanguage } from "@xiechao/codemirror-lang-handlebars"
import { indentWithTab } from "@codemirror/commands"
import { EditorView, keymap, placeholder, MatchDecorator } from "@codemirror/view"
import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import { javascriptLanguage } from "@codemirror/lang-javascript";

window.EditorView = EditorView;
window.basicSetup = basicSetup;
window.handlebarsLanguage = handlebarsLanguage;
window.indentWithTab = indentWithTab;
window.keymap = keymap;
window.placeholder = placeholder;
window.javascriptLanguage = javascriptLanguage;

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