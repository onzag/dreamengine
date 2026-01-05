/**
 * @type {any}
 */
const schema = {
    "title": "Script Schema",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "title": "Script Name",
            "default": "New Script"
        },
        "description": {
            "type": "string",
            "title": "Description",
            "default": "",
            "placeholder": "A brief description of the script.",
            "multiline": true,
        },
        "context": {
            "type": "string",
            "title": "Execution Context",
            "enum": ["Character Spawn"],
            "enum_definitions": [
                "Useful to set additional attributes and properties when the character is first created, eg. mark a character a certain race and add to their backstory for this world, add behaviours etc...",
            ],
            "default": "Character Spawn",
            "description": "Defines where this script runs. 'global' scripts run once for the entire application, 'character' scripts run per character, and 'scene' scripts run per scene."
        },
        "script": {
            "type": "object",
            "properties": {
                "imports": {
                    "type": "array",
                    "title": "Imports",
                },
                "script": {
                    "type": "string",
                },
                "ts": {
                    "type": "string",
                },
            },
            "title": "Script Code",
            "default": "",
            "placeholder": "// Write your script here. Use char and DE objects to interact with the character and engine.\n",
            "multiline": true,
            "code_language": "typescript",
        },
        "configurable_properties": {
            "type": "object",
            "title": "Configurable Properties",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "title": "Property Type",
                        "enum": ["string", "number", "boolean", "json"],
                        "default": "string"
                    },
                    "placeholder": {
                        "type": "string",
                        "title": "Placeholder",
                        "default": ""
                    },
                    "default": {
                        "type": "string",
                        "title": "Default Value",
                        "default": "",
                        "multiline": true,
                        "code_language": "json",
                        "placeholder": "Default value for this property, json encoded"
                    },
                },
            },
            "real_type": "arbitrary_property_object",
        },
        "freeze_states": {
            "type": "array",
            "title": "Freeze States",
            "description": "List of character states that this script does not allow to be modified, by the user configuration",
            "items": {
                "type": "string",
            },
            "real_type": "arbitrary_state_string",
        },
        "freeze_root_properties": {
            "type": "array",
            "title": "Freeze Root Properties",
            "description": "List of root character properties that this script does not allow to be modified, by the user configuration",
            "items": {
                "type": "string",
            },
            "real_type": "arbitrary_property_string",
        },
    },
    "required": ["name", "script"],
}

export default schema;