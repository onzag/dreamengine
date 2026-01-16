/**
 * @type {any}
 */
const schema = {
    "title": "Character Schema",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "title": "Character Name",
            "description": "The name of the character",
            "placeholder": "Alice",
            "maxLength": 100,
            "minLength": 1
        },
        "group": {
            "type": "string",
            "title": "Character Group",
            "description": "The group the character belongs to, used for organizing characters into folders",
            "placeholder": "default",
            "maxLength": 100,
            "minLength": 1
        },
        "gender": {
            "type": "string",
            "title": "Character Gender",
            "description": "The gender of the character",
            "enum": [
                "male",
                "female",
                "ambiguous"
            ]
        },
        "sex": {
            "type": "string",
            "title": "Character Sex",
            "description": "The sex of the character",
            "enum": [
                "male",
                "female",
                "intersex",
                "none"
            ]
        },
        "age_years": {
            "type": "integer",
            "title": "Character Age",
            "description": "The age of the character in years",
            "minimum": 0,
            "maximum": 100000,
            "default": 25,
            "unit": "years",
        },
        "general": {
            "type": "object",
            "properties": {
                "script": {
                    "type": "string",
                },
                "ts": {
                    "type": "string",
                },
            },
            "title": "General Information",
            "description": "Describes the character general behaviour and personality, it is in YOU format, you are, you do, as {{char}}",
            "maxLength": 1000,
            "minLength": 50,
            "placeholder": "You are {{char}} a brave and adventurous explorer, always seeking new challenges and experiences.\n\nYou have a strong sense of justice and are willing to help those in need",
            "placeholder_ts": "return `You are ${char.name} a brave and adventurous explorer, always seeking new challenges and experiences.\n\nYou have a strong sense of justice and are willing to help those in need.`;",
            "multiline": true,
            "code_language": "handlebars"
        },
        "short_description": {
            "type": "string",
            "title": "Short Description",
            "description": "A short mostly physical (on the surface) description of the character, used in lists and overviews, do not include clothing here as it varies",
            "maxLength": 250,
            "minLength": 20,
            "placeholder": "A muscular woman with short brown hair and green eyes",
            "multiline": true,
        },
        "short_description_naked": {
            "type": "string",
            "title": "Short Description (Naked)",
            "description": "A short mostly physical (on the surface) description of the character when not wearing any clothes",
            "maxLength": 250,
            "minLength": 20,
            "placeholder": "A muscular woman with short brown hair and green eyes",
            "multiline": true,
        },
        "height_cm": {
            "type": "integer",
            "title": "Character Height",
            "description": "The height of the character in centimeters, used to determine if they fit in certain locations (eg. a small cave or a vehicle)",
            "minimum": 30,
            "maximum": 300,
            "default": 170,
            "unit": "cm",
        },
        "weight_kg": {
            "type": "integer",
            "title": "Character Weight",
            "description": "The weight of the character in kilograms, used to determine if they can be carried by others (eg. a dragon carrying a person)",
            "minimum": 0,
            "maximum": 3000,
            "default": 70,
            "unit": "kg",
        },
        "range_meters": {
            "type": "integer",
            "title": "Character Range",
            "description": "The maximum range the character can travel without needing to rest or refuel, used to determine how far they can go in a single trip",
            "minimum": 1,
            "maximum": 10000,
            "default": 100,
            "unit": "meters",
        },
        "locomotion_speed_meters_per_second": {
            "type": "number",
            "title": "Locomotion Speed",
            "description": "The speed at which the character moves in meters per second, used to determine how fast they can travel",
            "minimum": 0.1,
            "maximum": 20,
            "default": 1.5,
            "unit": "m/s",
        },
        "maintenance_calories_per_day": {
            "type": "integer",
            "title": "Maintenance Calories Per Day",
            "description": "The number of calories the character needs to maintain their weight per day, note by default characters do not lose/gain weight or starve, a script needs to be added to enforce this behaviour",
            "minimum": 0,
            "maximum": 10000,
            "default": 2000,
            "unit": "kcal",
        },
        "maintenance_hydration_liters_per_day": {
            "type": "number",
            "title": "Maintenance Hydration Liters Per Day",
            "description": "The amount of water the character needs to maintain their hydration per day, note by default characters do not dehydrate, a script needs to be added to enforce this behaviour",
            "minimum": 0,
            "maximum": 300,
            "default": 2,
            "unit": "liters",
        },
        "carrying_capacity_kg": {
            "type": "integer",
            "title": "Carrying Capacity",
            "description": "The carrying capacity of the character in kilograms",
            "minimum": 0,
            "maximum": 10000,
            "default": 20,
            "unit": "kg",
        },
        "carrying_capacity_liters": {
            "type": "integer",
            "title": "Carrying Capacity",
            "description": "The carrying capacity of the character in liters",
            "minimum": 0,
            "maximum": 1000,
            "default": 3,
            "unit": "liters",
        },
        "initiative": {
            "type": "number",
            "title": "Character Initiative",
            "description": "A percentage that determines how often per turn the character takes initiative in conversations he is directly not being addressed at",
            "minimum": 0,
            "maximum": 1,
            "default": 0.2,
            "percentage": true,
        },
        "stranger_initiative": {
            "type": "number",
            "title": "Stranger Initiative",
            "description": "A percentage that determines how often per turn the character takes initiative in conversations with strangers, should probably be very small, otherwise they are very extroverted and annoying",
            "minimum": 0,
            "maximum": 1,
            "default": 0.01,
            "percentage": true,
        },
        "stranger_rejection": {
            "type": "number",
            "title": "Stranger Rejection Likelihood",
            "description": "A percentage that determines how likely is a character to actively reject interactions from strangers, higher values indicate more rejection behaviour; useful for shy or aggressive antisocial characters",
            "minimum": 0,
            "maximum": 1,
            "default": 0.05,
            "percentage": true,
        },
        "autism": {
            "type": "number",
            "title": "Autistic Response Likelihood",
            "description": "A percentage that determines a non-verbal non-social autistic answer, higher values indicate more autistic behaviour; if your character is already non-verbal do not use this; note that this doesn't replace a character being defined as autistic in its description, this is more akin sudden autistic behaviour",
            "minimum": 0,
            "maximum": 1,
            "default": 0,
            "percentage": true,
        },
        "schizophrenia": {
            "type": "number",
            "title": "Schizophrenic Response Likelihood",
            "description": "A percentage that determines the probability to hear voices or see things that are not there, a highly schizophrenic (above 0.5) character will receive a voice effect as a random character, however sometimes a real character may be used",
            "minimum": 0,
            "maximum": 1,
            "default": 0,
            "percentage": true,
        },
        "wander_potential": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "title": "Wander Potential",
            "description": "When a character is left to its means, this value determines a random roll, per inference for the character to start to wander, not being there anymore",
            "default": 0.05,
        },
        "emotions": {
            "title": "Character Emotions",
            "description": "Defines the emotions associated with the character",
            "type": "object",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "common": {
                        "type": "boolean",
                        "title": "Common Emotion",
                        "description": "Indicates if this emotion is commonly experienced by the character"
                    },
                    "uncommon": {
                        "type": "boolean",
                        "title": "Uncommon Emotion",
                        "description": "Indicates if this emotion is uncommonly experienced by the character"
                    },
                    "triggered_by_states": {
                        "type": "array",
                        "title": "Triggered By States",
                        "description": "States that can trigger this emotion",
                        "items": {
                            "type": "string",
                            "description": "The name of the state that can trigger this emotion"
                        },
                        "real_type": "known_state_string",
                    },
                },
                "required": [
                    "common",
                    "uncommon",
                    "triggered_by_states"
                ]
            },
            "real_type": "arbitrary_emotion_object",
        },
        "properties": {
            "type": "object",
            "title": "Character Properties",
            "description": "Custom properties for the character, used for advanced scripting and behaviour customization",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "value": {
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
                        "code_language": "typescript",
                    },
                }
            },
            "default": {
                "race": {value: {ts: "return \"human\";", script: "return \"human\";"}},
                "age": {value: {ts: "return 30;", script: "return 30;"}},
            },
            "real_type": "for_properties_input",
        },
        "advanced_spawn_script": {
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
            "title": "Spawn Script",
            "description": "A TypeScript script that runs when the character is spawned for the first time, allowing for advanced customization of character initial state. Characters are only spawned once when the world is created and they always exist after that",
            "multiline": true,
            "code_language": "typescript",
            "code_context": "Character Spawn",
            "placeholder": "// TypeScript code here, use char and DE",
        },
    },
    "required": [
        "states",
        "bonds",
        "general",
        "initiative"
    ]
}

export default schema;