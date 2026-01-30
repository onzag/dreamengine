import { importScriptAsPropertyValueInCharacterSpace, importScriptAsPropertyValueInItemSpace, importScriptAsScript, importScriptAsTemplate } from "../imports/scripts.js";

/**
 * @type {DEUtils}
 */
export const deEngineUtils = {
    newHandlebarsTemplate(DE, id, source) {
        const existingScriptSource = DE.scriptSources.find(s => s.id === id);
        if (existingScriptSource) {
            if (existingScriptSource.sourceType !== "handlebars") {
                throw new Error(`Script source with id ${id} already exists with different type ${existingScriptSource.type}`);
            } else if (existingScriptSource.source !== source) {
                throw new Error(`Script source with id ${id} already exists with different source code`);
            } else if (existingScriptSource.type !== "template") {
                throw new Error(`Script source with id ${id} already exists with a non-template type ${existingScriptSource.type}`);
            }
            return {
                execute: existingScriptSource.run,
                id: existingScriptSource.id,
                type: existingScriptSource.type,
            }
        }
        const handlebarsTemplate = importScriptAsTemplate(id, id, "handlebars", source);
        DE.scriptSources.push({
            id: handlebarsTemplate.id,
            sourceType: "handlebars",
            source: source,
            run: handlebarsTemplate.execute,
            imports: [],
            type: "template",
        });
        return handlebarsTemplate;
    },
    newLocationFromStaticDefinition(DE, locationDef) {
        /**
         * @type {DEStatefulLocationDefinition}
         */
        const statefulLocation = {
            ...locationDef,

            // @ts-ignore
            currentWeather: null,
            // @ts-ignore
            currentWeatherFullEffectDescription: null,
            // @ts-ignore
            currentWeatherHasBeenOngoingFor: null,
            // @ts-ignore
            currentWeatherNoEffectDescription: null,
            // @ts-ignore
            currentWeatherPartialEffectDescription: null,
        }

        if (locationDef.parent === null) return statefulLocation;

        const parentLocation = DE.world.locations[locationDef.parent];
        if (!parentLocation) {
            throw new Error(`Parent location with name ${locationDef.parent} not found`);
        }

        // copy weather from parent
        if (!locationDef.ownWeatherSystem) {
            statefulLocation.currentWeather = parentLocation.currentWeather;
            statefulLocation.currentWeatherFullEffectDescription = parentLocation.currentWeatherFullEffectDescription;
            statefulLocation.currentWeatherHasBeenOngoingFor = parentLocation.currentWeatherHasBeenOngoingFor;
            statefulLocation.currentWeatherNoEffectDescription = parentLocation.currentWeatherNoEffectDescription;
            statefulLocation.currentWeatherPartialEffectDescription = parentLocation.currentWeatherPartialEffectDescription;
        }

        return statefulLocation;
    },
    newConnectionFromStaticDefinition(DE, connectionDef) {
        return connectionDef;
    },
    newScript(DE, id, executeFunction) {
        // we need to extract the source code from the function
        const source = "return await ((" + executeFunction.toString() + ")(DE, char))";
        const existingScriptSource = DE.scriptSources.find(s => s.id === id);
        if (existingScriptSource) {
            if (existingScriptSource.sourceType !== "javascript") {
                throw new Error(`Script source with id ${id} already exists with different type ${existingScriptSource.type}`);
            } else if (existingScriptSource.source !== source) {
                throw new Error(`Script source with id ${id} already exists with different source code`);
            } else if (existingScriptSource.type !== "script") {
                throw new Error(`Script source with id ${id} already exists with a non-script type ${existingScriptSource.type}`);
            }
            return {
                execute: existingScriptSource.run,
                id: existingScriptSource.id,
                type: /** @type {"script"} */ (existingScriptSource.type),
            }
        }
        const script = importScriptAsScript(id, id, source);
        DE.scriptSources.push({
            id: script.id,
            sourceType: "javascript",
            source: source,
            run: script.execute,
            imports: [],
            type: "script",
        });
        return script;
    },
    newTemplateFromFunction(DE, id, fn) {
        // we need to extract the source code from the function
        const source = "return await ((" + fn.toString() + ")(DE, char, other, causants, potentialCausant, potentialCausants))";
        const existingScriptSource = DE.scriptSources.find(s => s.id === id);
        if (existingScriptSource) {
            if (existingScriptSource.sourceType !== "javascript") {
                throw new Error(`Script source with id ${id} already exists with different type ${existingScriptSource.type}`);
            } else if (existingScriptSource.source !== source) {
                throw new Error(`Script source with id ${id} already exists with different source code`);
            } else if (existingScriptSource.type !== "template") {
                throw new Error(`Script source with id ${id} already exists with a non-template type ${existingScriptSource.type}`);
            }
            return {
                execute: existingScriptSource.run,
                id: existingScriptSource.id,
                type: /** @type {"template"} */ (existingScriptSource.type),
            }
        }
        const script = importScriptAsTemplate(id, id, "javascript", source);
        DE.scriptSources.push({
            id: script.id,
            sourceType: "javascript",
            source: source,
            run: script.execute,
            imports: [],
            type: "template",
        });
        return script;
    },
    newWeatherSystem(DE, weatherSystemDef) {
        return weatherSystemDef;
    },
    newValueGetterScriptForCharacterSpace(DE, id, value) {
        const source = "return await ((" + value.toString() + ")(DE, char))";
        const existingScriptSource = DE.scriptSources.find(s => s.id === id);
        if (existingScriptSource) {
            if (existingScriptSource.sourceType !== "javascript") {
                throw new Error(`Script source with id ${id} already exists with different type ${existingScriptSource.type}`);
            } else if (existingScriptSource.source !== source) {
                throw new Error(`Script source with id ${id} already exists with different source code`);
            } else if (existingScriptSource.type !== "value_getter_char_space") {
                throw new Error(`Script source with id ${id} already exists with a non-value getter in char space type ${existingScriptSource.type}`);
            }
            return {
                value: existingScriptSource.run,
                id: existingScriptSource.id,
                type: /** @type {"value_getter_char_space"} */ (existingScriptSource.type),
            }
        }
        const script = importScriptAsPropertyValueInCharacterSpace(id, id, source, "javascript");
        DE.scriptSources.push({
            id: script.id,
            sourceType: "javascript",
            source: source,
            run: script.value,
            imports: [],
            type: "value_getter_char_space",
        });
        return script;
    },
    newValueGetterScriptForItemSpace(DE, id, value) {
        const source = "return await ((" + value.toString() + ")(DE, item))";
        const existingScriptSource = DE.scriptSources.find(s => s.id === id);
        if (existingScriptSource) {
            if (existingScriptSource.sourceType !== "javascript") {
                throw new Error(`Script source with id ${id} already exists with different type ${existingScriptSource.type}`);
            } else if (existingScriptSource.source !== source) {
                throw new Error(`Script source with id ${id} already exists with different source code`);
            } else if (existingScriptSource.type !== "value_getter_item_space") {
                throw new Error(`Script source with id ${id} already exists with a non-value getter in item space type ${existingScriptSource.type}`);
            }
            return {
                value: existingScriptSource.run,
                id: existingScriptSource.id,
                type: /** @type {"value_getter_item_space"} */ (existingScriptSource.type),
            }
        }
        const script = importScriptAsPropertyValueInItemSpace(id, id, source, "javascript");
        DE.scriptSources.push({
            id: script.id,
            sourceType: "javascript",
            source: source,
            run: script.value,
            imports: [],
            type: "value_getter_item_space",
        });
        return script;
    },
    propertyValueToTemplate(DE, propertyValue) {
        /**
         * @type {DEStringTemplate}
         */
        const template = {
            execute: propertyValue.value,
            id: propertyValue.id,
            type: "template",
        };
        return template;
    }
}