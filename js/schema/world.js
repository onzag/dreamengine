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
        "initial_scenes": {
            "type": "object",
            "title": "Initial Scenes",
            "description": "The initial scenes of the world.",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "drop_location": {
                        "type": "string",
                        "title": "Drop Location",
                        "default": "",
                        "real_type": "location",
                    },
                    "drop_location_slot": {
                        "type": "string",
                        "title": "Drop Location Slot",
                        "real_type": "location_slot",
                        "default": "",
                        "description": "The specific slot within the location where the user will be placed upon entering the scene.",
                    },
                    "user_initialization_message": {
                        "type": "object",
                        "properties": {
                            "ts": {
                                "type": "string",
                            },
                            "script": {
                                "type": "string",
                            },
                        },
                        "title": "User Initialization Message",
                        "default": "",
                        "multiline": true,
                        "code_language": "handlebars",
                        "description": "A message shown to the user when they enter this scene for the first time.",
                        "placeholder": "Use {{user}} to reference the user's name.",
                    }
                },
            },
        },
        "locations": {
            "type": "array",
            "title": "Locations",
            "description": "The locations in the world.",
            "items": {
                "type": "object",
            },
        }
    },
}