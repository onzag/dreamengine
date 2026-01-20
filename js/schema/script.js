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
            "enum": ["Character Spawn", "World Creation"],
            "enum_definitions": [
                "Useful to set additional attributes and properties when the character is first created, eg. mark a character a certain race and add to their backstory for this world, add behaviours etc...",
                "Useful to set up world-level properties, locations, connections, global variables, etc...",
            ],
            "default": "Character Spawn",
            "description": "Defines where this script runs. 'world creation' scripts run once for the entire application, 'character spawn' scripts run per character"
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
                    "placeholder": {
                        "type": "string",
                        "title": "Placeholder",
                        "default": ""
                    },
                    "default": {
                        "type": "object",
                        "description": "Default Value",
                        "properties": {
                            "ts": {
                                "type": "string",
                            },
                            "script": {
                                "type": "string",
                            },
                        },
                        "title": "Default Value",
                        "default": "",
                        "multiline": true,
                        "code_language": "typescript",
                        "placeholder": "Default value for this property"
                    },
                },
            },
            "real_type": "arbitrary_property_object",
        },
    },
    "required": ["name", "script"],
}

export default schema;