import { EMOTIONS_LIST } from '../engine/rolling-emotion.js';
import schema from '../schema/character.js';
import { importScriptAsPropertyValueInCharacterSpace, importScriptAsPropertyValueInItemSpace, importScriptAsScript, importScriptAsTemplate, importScriptFromJSON } from './scripts.js';

/**
 * @param {any} internalSchema
 * @param {any} obj 
 * @param {string} propertyName 
 * @returns 
 */
export function extractSimpleProperty(internalSchema, obj, propertyName) {
    const schemaValue = internalSchema.properties[propertyName];
    if (!schemaValue) {
        throw new Error(`Property ${propertyName} is not defined in the schema.`);
    }
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
                type: "script",
                sourceType: "handlebars",
                source: "",
                run: () => "",
                imports: [],
            }];
        }

        if (value.ts) {
            const importedTemplate = importScriptAsTemplate("?TEMPLATE_" + prefix + "_" + propertyName.toUpperCase(), prefix + " " + propertyName + " Template", "javascript", value.script);
            return [importedTemplate, {
                id: importedTemplate.id,
                type: "script",
                sourceType: "javascript",
                source: value.script,
                run: importedTemplate.execute,
                imports: [],
            }];
        } else {
            const importedTemplate = importScriptAsTemplate("?TEMPLATE_" + prefix + "_" + propertyName.toUpperCase(), prefix + " " + propertyName + " Template", "handlebars", value.script);
            return [importedTemplate, {
                id: importedTemplate.id,
                type: "script",
                sourceType: "handlebars",
                source: value.script,
                run: importedTemplate.execute,
                imports: [],
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

        if (value.script.trim().length === 0) {
            return [{
                id: "?INTERNAL_NOOP_VALUE_GETTER",
                // @ts-ignore
                value: null,
                type: valueGetterType,
            }, {
                id: "?INTERNAL_NOOP_VALUE_GETTER",
                type: "script",
                sourceType: "javascript",
                source: "",
                run: () => null,
                imports: [],
            }];
        }

        if (valueGetterType === "value_getter_char_space") {
            const importedGetter = importScriptAsPropertyValueInCharacterSpace(
                "?VALUE_GETTER_CHAR_SPACE_" + prefix + "_" + propertyName.toUpperCase(),
                prefix + " " + propertyName + " Value Getter Char Space",
                value.script,
                value.ts ? "javascript" : "handlebars",
            );
            return [importedGetter, {
                id: importedGetter.id,
                type: "script",
                sourceType: value.ts ? "javascript" : "handlebars",
                source: value.script,
                run: importedGetter.value,
                imports: [],
            }];
        } else {
            const importedGetter = importScriptAsPropertyValueInItemSpace(
                "?VALUE_GETTER_ITEM_SPACE_" + prefix + "_" + propertyName.toUpperCase(),
                prefix + " " + propertyName + " Value Getter Item Space",
                value.script,
                value.ts ? "javascript" : "handlebars",
            );
            return [importedGetter, {
                id: importedGetter.id,
                type: "script",
                sourceType: value.ts ? "javascript" : "handlebars",
                source: value.script,
                run: importedGetter.value,
                imports: [],
            }];
        }
    } else {
        throw new Error(`Missing property ${propertyName} for script template import.`);
    }
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
            schema.properties["properties"].additionalProperties,
            characterName + "_PROPERTY_",
            propertiesJson,
            propertyName,
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

    const [properties, propertiesSources] = importCharacterPropertiesFromJSON(characterName, json);
    const [spawnScript, spawnScriptSource] = importScriptFromJSON("?" + characterName + "_DEFAULT_SPAWN_SCRIPT", json, "spawn_script");

    /**
     * @type {Record<string, DEScript>}
     */
    const spawnScriptsObject = {
        [spawnScript.id]: spawnScript,
    };

    /**
     * @type {DECompleteCharacterReference}
     */
    const character = {
        autism: extractSimpleProperty(schema, json, "autism"),
        carryingCapacityKg: extractSimpleProperty(schema, json, "carrying_capacity_kg"),
        carryingCapacityLiters: extractSimpleProperty(schema, json, "carrying_capacity_liters"),
        heightCm: extractSimpleProperty(schema, json, "height_cm"),
        gender: extractSimpleProperty(schema, json, "gender"),
        sex: extractSimpleProperty(schema, json, "sex"),
        ageYears: extractSimpleProperty(schema, json, "age_years"),
        weightKg: extractSimpleProperty(schema, json, "weight_kg"),
        name: characterName,
        initiative: extractSimpleProperty(schema, json, "initiative"),
        actionPromptInjection: {},
        generalCharacterDescriptionInjection: {},
        schizophrenia: extractSimpleProperty(schema, json, "schizophrenia"),
        schizophrenicVoiceDescription: schizophrenicVoiceDescription,
        wanderPotential: extractSimpleProperty(schema, json, "wander_potential"),
        shortDescription: extractSimpleProperty(schema, json, "short_description"),
        shortDescriptionTopNakedAdd: extractSimpleProperty(schema, json, "short_description_top_naked_add"),
        shortDescriptionBottomNakedAdd: extractSimpleProperty(schema, json, "short_description_bottom_naked_add"),
        strangerInitiative: extractSimpleProperty(schema, json, "stranger_initiative"),
        strangerRejection: extractSimpleProperty(schema, json, "stranger_rejection"),
        maintenanceCaloriesPerDay: extractSimpleProperty(schema, json, "maintenance_calories_per_day"),
        maintenanceHydrationLitersPerDay: extractSimpleProperty(schema, json, "maintenance_hydration_liters_per_day"),
        locomotionSpeedMetersPerSecond: extractSimpleProperty(schema, json, "locomotion_speed_meters_per_second"),
        rangeMeters: extractSimpleProperty(schema, json, "range_meters"),
        stealth: extractSimpleProperty(schema, json, "stealth"),
        perception: extractSimpleProperty(schema, json, "perception"),
        heroism: extractSimpleProperty(schema, json, "heroism"),
        characterRules: {},

        states: {},
        properties: properties,
        bonds: {
            declarations: [],
            bondChangeFineTune: 1.0,
            bondChangeNegativityBias: 1.0,
            strangerBreakawayBondWeightAbsolute: 10,
            strangerBreakawayInteractionsCount: 10,
            strangerBreakawayTimeMinutes: 30,
            strangerNegativeMultiplier: 1.0,
            strangerPositiveMultiplier: 1.0,
            system: "UNKNOWN",
            descriptionGeneralInjection: null,
        },
        emotions: importCharacterEmotionsFromJSON(json),
        scripts: {
            spawn: spawnScriptsObject,
            preInference: {},
            preStateCheck: {},
            postInference: {},
            postAnyInference: {},
            firstInteract: {},
        },

        general: generalTemplate,
    }

    /**
     * @type {DEScriptSource[]}
     */
    const scriptsSources = [
        generalTemplateSource,
        schizophrenicVoiceDescriptionSource,
        ...propertiesSources,
        spawnScriptSource,
    ];

    return { character, scriptSources: scriptsSources };
}

/**
 * 
 * @param {DECompleteCharacterReference} character 
 * @param {boolean} strangerBondValue 
 * @returns 
 */
function validateBondsCoverageHelper(character, strangerBondValue) {
    /**
     * @type {Array<[string, number, number, number, number]>}
     */
    const strengthValues = character.bonds.declarations.filter((b) => b.strangerBond === strangerBondValue).map(entry => {
        const entryName = entry.name;
        const minBondValue = entry.minBondLevel;
        const maxBondValue = entry.maxBondLevel;
        const min2BondValue = entry.min2BondLevel;
        const max2BondValue = entry.max2BondLevel;
        return [entryName, minBondValue, maxBondValue, min2BondValue, max2BondValue];
    });

    // find overlaps on the first bond levels
    for (let i = 0; i < strengthValues.length; i++) {
        const [nameA, minA, maxA, min2A, max2A] = strengthValues[i];
        for (let j = i + 1; j < strengthValues.length; j++) {
            if (i === j) continue;
            const [nameB, minB, maxB, min2B, max2B] = strengthValues[j];
            // check for overlap on both bond levels, the overlap is inclusive of the min value,
            // so the max of one bond can be the same as the min of another bond without overlapping
            const overlapOnFirstBond = (minA < maxB) && (maxA > minB);
            const overlapOnSecondBond = (min2A < max2B) && (max2A > min2B);
            if (overlapOnFirstBond && overlapOnSecondBond) {
                throw new Error(`Bond strength levels for "${nameA}" and "${nameB}" overlap on the primary and secondary bonds with stranger_bond=${strangerBondValue}. Ensure bond ranges do not overlap.`);
            }
        }
    }

    // now we need to check that there are no gaps in the bonds level
    const minBoxBondLevel = -100;
    const maxBoxBondLevel = 100;
    const min2BoxBondLevel = 0;
    const max2BoxBondLevel = 100;

    // Mathematically complete coverage check using sweep line algorithm
    // Collect all unique x-coordinates from rectangle boundaries
    const xCoords = new Set([minBoxBondLevel, maxBoxBondLevel]);
    for (const [name, min1, max1, min2, max2] of strengthValues) {
        xCoords.add(min1);
        xCoords.add(max1);
    }
    const sortedXCoords = Array.from(xCoords).sort((a, b) => a - b);

    // For each x-interval, check if y-dimension is fully covered
    for (let i = 0; i < sortedXCoords.length - 1; i++) {
        const xStart = sortedXCoords[i];
        const xEnd = sortedXCoords[i + 1];

        // Collect all y-intervals that cover this x-range
        const yIntervals = [];
        for (const [name, min1, max1, min2, max2] of strengthValues) {
            // Rectangle covers this x-range if xStart and xEnd are both within [min1, max1]
            if (min1 <= xStart && xEnd <= max1) {
                yIntervals.push([min2, max2]);
            }
        }

        // Sort y-intervals by start point
        yIntervals.sort((a, b) => a[0] - b[0]);

        // Check if y-intervals cover [min2BoxBondLevel, max2BoxBondLevel] without gaps
        let currentY = min2BoxBondLevel;
        for (const [yStart, yEnd] of yIntervals) {
            if (yStart > currentY) {
                // Gap found between currentY and yStart
                throw new Error(`Bond strength levels have a gap at x∈[${xStart}, ${xEnd}], y∈[${currentY}, ${yStart}]. Ensure bond ranges touch at boundaries, with stranger_bond=${strangerBondValue}.`);
            }
            currentY = Math.max(currentY, yEnd);
        }

        if (currentY < max2BoxBondLevel) {
            // Gap at the end
            throw new Error(`Bond strength levels have a gap at x∈[${xStart}, ${xEnd}], y∈[${currentY}, ${max2BoxBondLevel}]. The y-dimension is not fully covered, with stranger_bond=${strangerBondValue}.`);
        }
    }

    return;
}

/**
 * @param {DECompleteCharacterReference} character 
 */
export function validateBondsCoverage(character) {
    validateBondsCoverageHelper(character, true);
    validateBondsCoverageHelper(character, false);
}