const worldSchema = {
    "title": "World Schema",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "title": "World Name",
            "default": "My World",
            "description": "The name of the world",
        },
        "description": {
            "type": "string",
            "title": "World Description",
            "default": "",
            "placeholder": "A brief description of the world.",
            "multiline": true,
        },
        "characters": {
            "type": "object",
            "title": "Characters",
            "description": "The characters that exist in the world",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "import": {
                        "type": "string",
                        "title": "Character Import",
                        "description": "The path to the character JSON definition file to import",
                    },
                    "properties": {
                        "type": "object",
                        "title": "Character Properties",
                        "description": "Additional custom properties to set on the character when they are spawned",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "ts": {
                                    "type": "string",
                                },
                                "script": {
                                    "type": "string",
                                },
                            },
                            "title": "Property Value",
                            "description": "The value of the property, can be any TypeScript expression that returns a value",
                            "multiline": true,
                            "code_language": "handlebars",
                        },
                        "default": {
                            "race": { ts: "return \"human\";", script: "return \"human\";" },
                            "age": { ts: "return 30;", script: "return 30;" },
                        },
                        "real_type": "for_properties_input_in_world_definition",
                    },
                    "spawn_location": {
                        "type": "string",
                        "title": "Spawn Location",
                        "description": "The Name of the location where the character will spawn",
                    },
                    "spawn_location_slot": {
                        "type": "string",
                        "title": "Spawn Location Slot",
                        "description": "The specific slot within the location where the character will spawn",
                    },
                },
            },
        },
        "advanced_world_script": {
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
                }
            },
            "title": "World Script",
            "description": "A TypeScript script that runs when the character is spawned for the first time, allowing for advanced customization of character initial state. Characters are only spawned once when the world is created and they always exist after that",
            "multiline": true,
            "code_language": "typescript",
            "code_context": "World Script",
            "placeholder": "// TypeScript code here, use DE only",
        },
        "advanced_all_characters_script": {
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
                }
            },
            "title": "All characters Spawn Script",
            "description": "A TypeScript script that gets applied to every character in the world when they are spawned for the first time, allowing for advanced customization of character initial state. Characters are only spawned once when the world is created and they always exist after that",
            "multiline": true,
            "code_language": "typescript",
            "code_context": "Spawn Script",
            "placeholder": "// TypeScript code here, use char and DE",
        },
    },
}

export default worldSchema;