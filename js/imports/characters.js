import { EMOTIONS_LIST } from '../engine/rolling-emotion.js';
import schema from '../schema/character.js';
import { importScriptAsPropertyValueInCharacterSpace, importScriptAsPropertyValueInItemSpace, importScriptAsScript, importScriptAsTemplate } from './scripts';

/**
 * @param {any} internalSchema
 * @param {any} obj 
 * @param {string} propertyName 
 * @returns 
 */
function extractSimpleProperty(internalSchema, obj, propertyName) {
    const schemaValue = internalSchema.properties[propertyName];
    let type = schemaValue.type;
    if (type === "integer") {
        type = "number";
    }
    if (obj.hasOwnProperty(propertyName)) {
        const value = obj[propertyName];
        if (value === null || value === undefined) {
            throw new Error(`Property ${propertyName} cannot be null or undefined for type ${type}.`);
        }
        if (typeof value !== type) {
            throw new Error(`Property ${propertyName} must be of type ${type}, but got ${typeof value}.`);
        }
        if (schemaValue.enum) {
            if (!schemaValue.enum.includes(value)) {
                throw new Error(`Property ${propertyName} must be one of ${schemaValue.enum.join(", ")}, but got ${value}.`);
            }
        }
        if (schemaValue.minimum !== undefined) {
            if (value < schemaValue.minimum) {
                throw new Error(`Property ${propertyName} must be at least ${schemaValue.minimum}, but got ${value}.`);
            }
        }
        if (schemaValue.maximum !== undefined) {
            if (value > schemaValue.maximum) {
                throw new Error(`Property ${propertyName} must be at most ${schemaValue.maximum}, but got ${value}.`);
            }
        }
        if (schemaValue.minLength !== undefined) {
            if (value.length < schemaValue.minLength) {
                throw new Error(`Property ${propertyName} must have length at least ${schemaValue.minLength}, but got ${value.length}.`);
            }
        }
        if (schemaValue.maxLength !== undefined) {
            if (value.length > schemaValue.maxLength) {
                throw new Error(`Property ${propertyName} must have length at most ${schemaValue.maxLength}, but got ${value.length}.`);
            }
        }
        return value;
    } else {
        throw new Error(`Missing property ${propertyName} for type ${type}.`);
    }
}

/**
 * @param {any} internalSchema
 * @param {any} obj 
 * @param {string} propertyName 
 * @returns 
 */
function extractArrayProperty(internalSchema, obj, propertyName) {
    const schemaValue = internalSchema.properties[propertyName].items;
    let type = schemaValue.type;
    if (type === "integer") {
        type = "number";
    }
    if (obj.hasOwnProperty(propertyName)) {
        const value = obj[propertyName];
        if (value === null || value === undefined) {
            throw new Error(`Property ${propertyName} cannot be null or undefined for type ${type}.`);
        }

        if (!Array.isArray(value)) {
            throw new Error(`Property ${propertyName} must be an array for type ${type}.`);
        }

        // @ts-ignore
        value.forEach((item, index) => {
            if (typeof item !== type) {
                throw new Error(`Property ${propertyName} must be of type ${type}, but got ${typeof item} at index ${index}.`);
            }
            if (schemaValue.enum) {
                if (!schemaValue.enum.includes(item)) {
                    throw new Error(`Property ${propertyName} must be one of ${schemaValue.enum.join(", ")}, but got ${item} at index ${index}.`);
                }
            }
            if (schemaValue.minimum !== undefined) {
                if (item < schemaValue.minimum) {
                    throw new Error(`Property ${propertyName} must be at least ${schemaValue.minimum}, but got ${item} at index ${index}.`);
                }
            }
            if (schemaValue.maximum !== undefined) {
                if (item > schemaValue.maximum) {
                    throw new Error(`Property ${propertyName} must be at most ${schemaValue.maximum}, but got ${item} at index ${index}.`);
                }
            }
            if (schemaValue.minLength !== undefined) {
                if (item.length < schemaValue.minLength) {
                    throw new Error(`Property ${propertyName} must have length at least ${schemaValue.minLength}, but got ${item.length} at index ${index}.`);
                }
            }
            if (schemaValue.maxLength !== undefined) {
                if (item.length > schemaValue.maxLength) {
                    throw new Error(`Property ${propertyName} must have length at most ${schemaValue.maxLength}, but got ${item.length} at index ${index}.`);
                }
            }
        });
        return value;
    } else {
        throw new Error(`Missing property ${propertyName} for type ${type}.`);
    }
}

/**
 * @param {any} internalSchema
 * @param {string} prefix
 * @param {string} obj 
 * @param {string} propertyName 
 * @returns {[array: DEStringTemplateWithIntensityAndCausants[], sources: DEScriptSource[]]}
 */
function extractArrayOfTemplateWithIntensityFromJSON(internalSchema, prefix, obj, propertyName) {
    const schemaValue = internalSchema.additionalProperties;
    if (obj.hasOwnProperty(propertyName)) {
        // @ts-ignore
        const value = obj[propertyName];
        if (value === null || value === undefined) {
            throw new Error(`Property ${propertyName} cannot be null or undefined for template with intensity array import.`);
        }
        if (Array.isArray(value) || typeof value !== "object") {
            throw new Error(`Property ${propertyName} must be an object for template with intensity array import.`);
        }
        /**
         * @type {DEStringTemplateWithIntensityAndCausants[]}
         */
        const resultArray = [];
        /**
         * @type {DEScriptSource[]}
         */
        const resultSources = [];

        Object.keys(value).forEach((key) => {
            const item = value[key];
            if (typeof item !== "object" || item === null) {
                throw new Error(`Property ${propertyName} must be an object of objects for template with intensity array import, but got ${typeof item} at key ${key}.`);
            } else if (typeof item.intensity !== "number") {
                throw new Error(`Property ${propertyName}.${key}.intensity must be a number for template with intensity array import.`);
            }

            const [importedTemplate, importedTemplateSource] = importScriptAsTemplateFromJSON(
                schemaValue.additionalProperties.properties.template,
                prefix + "_INTENSITY_" + key,
                item,
                "template",
            );
            const [importedDetermineCausants, importedDetermineCausantsSource] = importScriptAsTemplateFromJSON(
                schemaValue.additionalProperties.properties.determineCausants,
                prefix + "_INTENSITY_" + key,
                item,
                "determineCausants",
            );
            const [importedDetermineCause, importedDetermineCauseSource] = importScriptAsTemplateFromJSON(
                schemaValue.additionalProperties.properties.determineCause,
                prefix + "_INTENSITY_" + key,
                item,
                "determineCause",
            );

            // @ts-ignore
            resultArray.push({
                intensity: item.intensity,
                template: importedTemplate,
                determineCausants: importedDetermineCausants,
                determineCause: importedDetermineCause,
            });
            // @ts-ignore
            resultSources.push(importedTemplateSource);
            resultSources.push(importedDetermineCausantsSource);
            resultSources.push(importedDetermineCauseSource);
        });
        return [resultArray, resultSources];
    } else {
        throw new Error(`Missing property ${propertyName} for template with intensity array import.`);
    }
}

/**
 * Extracts an object with has an intensity in a parent object
 * @param {*} obj 
 * @param {string} propertyName
 * @return {{[stateName: string]: {intensity: number}}}
 */
function extractObjectOfIntensityFromJSON(obj, propertyName) {
    if (obj.hasOwnProperty(propertyName)) {
        // @ts-ignore
        const value = obj[propertyName];
        if (value === null || value === undefined) {
            throw new Error(`Property ${propertyName} cannot be null or undefined for intensity object import.`);
        }
        if (typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`Property ${propertyName} must be an object for intensity object import.`);
        }
        /**
         * @type {{[stateName: string]: {intensity: number}}}
         */
        const resultObject = {};
        Object.keys(value).forEach((key) => {
            const item = value[key];
            if (typeof item !== "object" || item === null) {
                throw new Error(`Property ${propertyName} must be an object of objects for intensity object import, but got ${typeof item} at key ${key}.`);
            }
            if (typeof item.intensity !== "number") {
                throw new Error(`Property ${propertyName}.${key}.intensity must be a number for intensity object import.`);
            }
            // @ts-ignore
            resultObject[key] = { intensity: item.intensity };
        });
        return resultObject;
    } else {
        throw new Error(`Missing property ${propertyName} for intensity object import.`);
    }
}

/**
 * @param {any} internalSchema
 * @param {string} prefix
 * @param {*} json 
 * @param {string} propertyName 
 * @returns {[DEStringTemplate, DEScriptSource]}
 */
function importScriptAsTemplateFromJSON(internalSchema, prefix, json, propertyName) {
    const schemaValue = internalSchema.properties[propertyName];

    if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        if (value === null || value === undefined) {
            throw new Error(`Property ${propertyName} cannot be null or undefined for script template import.`);
        }

        if (typeof value.script !== "string") {
            throw new Error(`Property ${propertyName}.script must be a string for script template import.`);
        } else if (value.ts && typeof value.ts !== "string") {
            throw new Error(`Property ${propertyName}.ts must be a string for script template import.`);
        }

        if (value.script.trim().length === 0) {
            return [{
                id: "?INTERNAL_NOOP_TEMPLATE",
                // @ts-ignore
                execute: null,
                type: "template",
            }, {
                id: "?INTERNAL_NOOP_TEMPLATE",
                type: "handlebars",
                source: "",
                run: () => "",
            }];
        }

        if (value.ts) {
            const importedTemplate = importScriptAsTemplate("?TEMPLATE_" + prefix + "_" + propertyName.toUpperCase(), prefix + " " + propertyName + " Template", "javascript", value.script);
            return [importedTemplate, {
                id: importedTemplate.id,
                type: "javascript",
                source: value.script,
                run: importedTemplate.execute,
            }];
        } else {
            const importedTemplate = importScriptAsTemplate("?TEMPLATE_" + prefix + "_" + propertyName.toUpperCase(), prefix + " " + propertyName + " Template", "handlebars", value.script);
            return [importedTemplate, {
                id: importedTemplate.id,
                type: "handlebars",
                source: value.script,
                run: importedTemplate.execute,
            }];
        }
    } else {
        throw new Error(`Missing property ${propertyName} for script template import.`);
    }
}

/**
 * @param {any} internalSchema
 * @param {string} prefix
 * @param {*} json 
 * @param {string} propertyName 
 * @param {"value_getter_char_space" | "value_getter_item_space"} valueGetterType
 * @returns {[DEPropertyValueInCharSpace | DEPropertyValueInItemSpace, DEScriptSource]}
 */
function importScriptAsValueGetterFromJSON(internalSchema, prefix, json, propertyName, valueGetterType) {
    const schemaValue = internalSchema.properties[propertyName];

    if (json.hasOwnProperty(propertyName)) {
        const value = json[propertyName];
        if (value === null || value === undefined) {
            throw new Error(`Property ${propertyName} cannot be null or undefined for script template import.`);
        }

        if (typeof value.script !== "string") {
            throw new Error(`Property ${propertyName}.script must be a string for script template import.`);
        }
        if (typeof value.ts !== "string") {
            throw new Error(`Property ${propertyName}.ts must be a string for script template import.`);
        }

        if (value.script.trim().length === 0) {
            return [{
                id: "?INTERNAL_NOOP_VALUE_GETTER",
                // @ts-ignore
                value: null,
                type: valueGetterType,
            }, {
                id: "?INTERNAL_NOOP_VALUE_GETTER",
                type: "javascript",
                source: "",
                run: () => null,
            }];
        }

        if (valueGetterType === "value_getter_char_space") {
            const importedGetter = importScriptAsPropertyValueInCharacterSpace("?VALUE_GETTER_CHAR_SPACE_" + prefix + "_" + propertyName.toUpperCase(), prefix + " " + propertyName + " Value Getter Char Space", value.script);
            return [importedGetter, {
                id: importedGetter.id,
                type: "javascript",
                source: value.script,
                run: importedGetter.value,
            }];
        } else {
            const importedGetter = importScriptAsPropertyValueInItemSpace("?VALUE_GETTER_ITEM_SPACE_" + prefix + "_" + propertyName.toUpperCase(), prefix + " " + propertyName + " Value Getter Item Space", value.script);
            return [importedGetter, {
                id: importedGetter.id,
                type: "javascript",
                source: value.script,
                run: importedGetter.value,
            }];
        }
    } else {
        throw new Error(`Missing property ${propertyName} for script template import.`);
    }
}

/**
 * 
 * @param {string} characterName 
 * @param {*} json 
 * @param {string} scriptName 
 * @returns {[DEScript[], DEScriptSource[]]}
 */
function importScriptsWithImportsFromJSON(characterName, json, scriptName) {
    /**
     * @type {DEScript[]}
     */
    const scriptsArray = [];
    /**
     * @type {DEScriptSource[]}
     */
    const scriptSources = [];

    // @ts-ignore
    const givenScript = json[scriptName];
    if (typeof givenScript !== "object" || givenScript === null) {
        throw new Error(`Property ${scriptName} must be an object.`);
    } else if (!givenScript.hasOwnProperty("script") || typeof givenScript["script"] !== "string") {
        throw new Error(`Property ${scriptName}.script must be a string.`);
    } else if (!givenScript.hasOwnProperty("ts") || typeof givenScript["ts"] !== "string") {
        throw new Error(`Property ${scriptName}.ts must be a string.`);
    }
    const scriptContent = givenScript["script"];
    if (scriptContent.trim().length === 0) {
        return [scriptsArray, scriptSources];
    }

    const importedScript = importScriptAsScript("?SCRIPT_" + characterName + "_" + scriptName.toUpperCase(), characterName + " " + scriptName + " Script", scriptContent);
    const imports = givenScript["imports"];
    if (Array.isArray(imports)) {
        imports.forEach((importName) => {
            scriptsArray.push({
                id: importName,
                type: "script",
                // @ts-ignore
                execute: null,
            });
        });
    }
    scriptsArray.push(importedScript);
    scriptSources.push({
        id: importedScript.id,
        type: "javascript",
        source: scriptContent,
        run: importedScript.execute,
    });
    return [scriptsArray, scriptSources];
}

/**
 * @param {string} characterName
 * @param {any} json 
 * @returns {[Record<string, CharacterStateDefinition>, DEScriptSource[]]}
 */
function importCharacterStatesFromJSON(characterName, json) {
    const states = {};
    const schemaForStates = schema.properties["states"];

    const statesJson = json["states"];
    if (typeof statesJson !== "object" || statesJson === null) {
        throw new Error(`Property states must be an object.`);
    }

    const scriptSources = [];

    for (const [stateName, stateJson] of Object.entries(statesJson)) {
        // Check A_Z_ regex for the name
        if (!/^[A-Z_]*$/.test(stateName)) {
            throw new Error(`State name ${stateName} is invalid. Must match /^[A-Z_]*$/ regex.`);
        }

        const [general, generalSource] = importScriptAsTemplateFromJSON(schemaForStates, characterName + "_STATE_" + stateName, stateJson, "general");
        scriptSources.push(generalSource);

        const [intensifiers, intensifiersSources] = extractArrayOfTemplateWithIntensityFromJSON(schemaForStates, characterName + "_STATE_" + stateName, stateJson, "intensifiers");
        scriptSources.push(...intensifiersSources);

        const [relievers, relieversSources] = extractArrayOfTemplateWithIntensityFromJSON(schemaForStates, characterName + "_STATE_" + stateName, stateJson, "relievers");
        scriptSources.push(...relieversSources);

        const [triggers, triggersSources] = extractArrayOfTemplateWithIntensityFromJSON(schemaForStates, characterName + "_STATE_" + stateName, stateJson, "triggers");
        scriptSources.push(...triggersSources);

        const [potentialCausantNegativeDescription, potentialCausantNegativeDescriptionSource] = importScriptAsTemplateFromJSON(schemaForStates, characterName + "_STATE_" + stateName, stateJson, "potential_causant_negative_description");
        scriptSources.push(potentialCausantNegativeDescriptionSource);

        const [potentialCausantPositiveDescription, potentialCausantPositiveDescriptionSource] = importScriptAsTemplateFromJSON(schemaForStates, characterName + "_STATE_" + stateName, stateJson, "potential_causant_positive_description");
        scriptSources.push(potentialCausantPositiveDescriptionSource);

        const [triggerDeadEnd, triggerDeadEndSource] = importScriptAsTemplateFromJSON(schemaForStates, characterName + "_STATE_" + stateName, stateJson, "triggers_dead_end");
        scriptSources.push(triggerDeadEndSource);

        const [relieving, relievingSource] = importScriptAsTemplateFromJSON(schemaForStates, characterName + "_STATE_" + stateName, stateJson, "relieving");
        scriptSources.push(relievingSource);

        /**
         * @type {CharacterStateDefinition}
         */
        const stateDefinition = {
            general: general,
            binaryBehaviour: extractSimpleProperty(schemaForStates, stateJson, "binary_behaviour"),
            commonState: extractSimpleProperty(schemaForStates, stateJson, "common_state"),
            requiresPosture: extractSimpleProperty(schemaForStates, stateJson, "requires_posture"),
            fallsDown: extractSimpleProperty(schemaForStates, stateJson, "falls_down"),
            decayRateAfterRelief: extractSimpleProperty(schemaForStates, stateJson, "decay_rate_after_relief"),
            decayRatePerInferenceCycle: extractSimpleProperty(schemaForStates, stateJson, "decay_rate_per_inference_cycle"),
            dominance: extractSimpleProperty(schemaForStates, stateJson, "dominance"),
            injuryAndDeath: extractSimpleProperty(schemaForStates, stateJson, "injury_and_death"),
            intensifiers,
            relievers,
            triggers,
            permanent: extractSimpleProperty(schemaForStates, stateJson, "permanent"),
            potentialCausantMax2BondAllowed: extractSimpleProperty(schemaForStates, stateJson, "potential_causant_max_2_bond_allowed"),
            potentialCausantMaxBondAllowed: extractSimpleProperty(schemaForStates, stateJson, "potential_causant_max_bond_allowed"),
            potentialCausantMin2BondRequired: extractSimpleProperty(schemaForStates, stateJson, "potential_causant_min_2_bond_required"),
            potentialCausantMinBondRequired: extractSimpleProperty(schemaForStates, stateJson, "potential_causant_min_bond_required"),
            potentialCausantStrangerAllowed: extractSimpleProperty(schemaForStates, stateJson, "potential_causant_stranger_allowed"),
            potentialCausantNonStrangerAllowed: extractSimpleProperty(schemaForStates, stateJson, "potential_causant_non_stranger_allowed"),
            potentialCausantNegativeDescription,
            potentialCausantPositiveDescription,
            randomSpawnRate: extractSimpleProperty(schemaForStates, stateJson, "random_spawn_rate"),
            promptInjection: extractSimpleProperty(schemaForStates, stateJson, "prompt_injection"),
            relievingPromptInjection: extractSimpleProperty(schemaForStates, stateJson, "relieving_prompt_injection"),
            systemPromptInjection: extractSimpleProperty(schemaForStates, stateJson, "system_prompt_injection"),
            relievingSystemPromptInjection: extractSimpleProperty(schemaForStates, stateJson, "relieving_system_prompt_injection"),
            reliefUsesDecayRate: extractSimpleProperty(schemaForStates, stateJson, "relief_uses_decay_rate"),
            triggersDeadEnd: triggerDeadEnd,
            triggersDeadEndRandomChance: extractSimpleProperty(schemaForStates, stateJson, "triggers_dead_end_random_chance"),
            triggersDeadEndWhileRelievingRandomChance: extractSimpleProperty(schemaForStates, stateJson, "triggers_dead_end_while_relieving_random_chance"),
            deadEndIsDeath: extractSimpleProperty(schemaForStates, stateJson, "dead_end_is_death"),
            relievesStates: extractObjectOfIntensityFromJSON(stateJson, "relieves_states"),
            triggersStates: extractObjectOfIntensityFromJSON(stateJson, "triggers_states"),
            triggersStatesOnRelieve: extractObjectOfIntensityFromJSON(stateJson, "triggers_states_on_relieve"),
            relieving,
            requiredStates: extractArrayProperty(schemaForStates, stateJson, "required_states"),
            requiresCharacterCausants: extractSimpleProperty(schemaForStates, stateJson, "requires_character_causants"),
            requiresObjectCausants: extractSimpleProperty(schemaForStates, stateJson, "requires_object_causants"),
            triggerLikelihood: extractSimpleProperty(schemaForStates, stateJson, "trigger_likelihood"),

            conflictStates: extractArrayProperty(schemaForStates, stateJson, "conflict_states"),
        };

        // @ts-ignore
        states[stateName] = stateDefinition;
    }

    // @ts-ignore
    return [states, scriptSources]
}

/**
 * @param {string} characterName
 * @param {any} json 
 * @returns {[Record<string, DEPropertyValueInCharSpace>, DEScriptSource[]]}
 */
function importCharacterPropertiesFromJSON(characterName, json) {
    /**
     * @type {Record<string, DEPropertyValueInCharSpace>}
     */
    const properties = {};
    const scriptSources = [];
    const propertiesJson = json["properties"];
    if (typeof propertiesJson !== "object" || propertiesJson === null) {
        throw new Error(`Property properties must be an object.`);
    }
    for (const [propertyName, propertyJson] of Object.entries(propertiesJson)) {
        if (typeof propertyJson !== "object" || propertyJson === null) {
            throw new Error(`Property properties.${propertyName} must be an object.`);
        }

        const [propertyValue, propertyValueSource] = importScriptAsValueGetterFromJSON(
            schema.properties["properties"]["value"].additionalProperties,
            characterName + "_PROPERTY_" + propertyName,
            propertyJson,
            "value",
            "value_getter_char_space",
        );
        scriptSources.push(propertyValueSource);
        // @ts-ignore
        properties[propertyName] = propertyValue;
    }

    return [properties, scriptSources];
}

/**
 * @param {*} json
 * @returns {Partial<Record<DEEmotionNames, DEEmotionDefinition>>}
 */
function importCharacterEmotionsFromJSON(json) {
    const emotionsJson = json["emotions"];
    if (typeof emotionsJson !== "object" || emotionsJson === null) {
        throw new Error(`Property emotions must be an object.`);
    }
    /**
     * @type {any}
     */
    const emotions = {};
    for (const [emotionName, emotionJson] of Object.entries(emotionsJson)) {
        if (typeof emotionJson !== "object" || emotionJson === null) {
            throw new Error(`Property emotions.${emotionName} must be an object.`);
        }
        // @ts-expect-error
        if (!EMOTIONS_LIST.includes(emotionName)) {
            throw new Error(`Emotion name ${emotionName} is not a valid emotion.`);
        }
        const commonEmotion = extractSimpleProperty(schema.properties["emotions"].additionalProperties, emotionJson, "common");
        const uncommonEmotion = extractSimpleProperty(schema.properties["emotions"].additionalProperties, emotionJson, "uncommon");
        const triggeredByStates = extractArrayProperty(schema.properties["emotions"].additionalProperties, emotionJson, "triggered_by_states");

        // @ts-ignore
        emotions[emotionName] = /**@type {DEEmotionDefinition}*/ {
            common: commonEmotion,
            uncommon: uncommonEmotion,
            triggeredByStates: triggeredByStates,
        };
    }

    return emotions;
}

/**
 * Imports a character from a JSON representation.
 * @param {DECompleteCharacterReference} json
 * @returns {{character: DECompleteCharacterReference, scriptSources: DEScriptSource[]}}
 */
export function importCharacterFromJSON(json) {
    const characterName = extractSimpleProperty(schema, json, "name");
    const [generalTemplate, generalTemplateSource] = importScriptAsTemplateFromJSON(schema, characterName, json, "general");

    if (!generalTemplate) {
        throw new Error("General template is required for character import.");
    }

    const [schizophrenicVoiceDescription, schizophrenicVoiceDescriptionSource] = importScriptAsTemplateFromJSON(schema, characterName, json, "schizophrenic_voice_description");

    if (!schizophrenicVoiceDescription) {
        throw new Error("Schizophrenic voice description template is required for character import.");
    }

    const [characterStatesResult, characterStatesSources] = importCharacterStatesFromJSON(characterName, json);

    const [properties, propertiesSources] = importCharacterPropertiesFromJSON(characterName, json);


    const [spawnScript, spawnScriptSources] = importScriptsWithImportsFromJSON(characterName, json, "spawn_script");

    /**
     * @type {DECompleteCharacterReference}
     */
    const character = {
        autisticResponse: extractSimpleProperty(schema, json, "autistic_response"),
        carryingCapacityKg: extractSimpleProperty(schema, json, "carrying_capacity_kg"),
        carryingCapacityLiters: extractSimpleProperty(schema, json, "carrying_capacity_liters"),
        heightCm: extractSimpleProperty(schema, json, "height_cm"),
        gender: extractSimpleProperty(schema, json, "gender"),
        sex: extractSimpleProperty(schema, json, "sex"),
        ageYears: extractSimpleProperty(schema, json, "age_years"),
        weightKg: extractSimpleProperty(schema, json, "weight_kg"),
        name: characterName,
        initiative: extractSimpleProperty(schema, json, "initiative"),
        injectableInGeneralText: {},
        injectableInReasoning: {},
        schizophrenia: extractSimpleProperty(schema, json, "schizophrenia"),
        schizophrenicVoiceDescription: schizophrenicVoiceDescription,
        wanderPotential: extractSimpleProperty(schema, json, "wander_potential"),
        shortDescription: extractSimpleProperty(schema, json, "short_description"),
        shortDescriptionNaked: extractSimpleProperty(schema, json, "short_description_naked"),
        strangerInitiative: extractSimpleProperty(schema, json, "stranger_initiative"),
        strangerRejection: extractSimpleProperty(schema, json, "stranger_rejection"),
        maintenanceCaloriesPerDay: extractSimpleProperty(schema, json, "maintenance_calories_per_day"),
        maintenanceHydrationLitersPerDay: extractSimpleProperty(schema, json, "maintenance_hydration_liters_per_day"),

        states: characterStatesResult,
        properties: properties,
        bonds: [],
        emotions: importCharacterEmotionsFromJSON(json),
        scripts: {
            spawn: spawnScript,
            preInference: [],
            preStateCheck: [],
            postInference: [],
            postAnyInference: [],
            firstInteract: [],
        },

        general: generalTemplate,
    }

    /**
     * @type {DEScriptSource[]}
     */
    const scriptsSources = [
        generalTemplateSource,
        schizophrenicVoiceDescriptionSource,
        ...characterStatesSources,
        ...propertiesSources,
        ...spawnScriptSources,
    ];

    return { character, scriptSources: scriptsSources };
}