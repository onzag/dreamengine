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