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
            "enum": ["Spawn", "First interact", "Pre inference", "Pre bond check", "Post inference", "Post any inference", "Bond modification rule", "Bond general declaration"],
            "enum_definitions": [
                "Useful to set additional attributes and properties when the character is first created, eg. mark a character a certain race and add to their backstory for this world",
                "Runs the first time the user interacts with the character. Useful for setting up initial state that depends on user interaction. The character is guaranteed to be in contact with the user at this point.",
                "Runs before each inference from the AI model. For this specific character, for modifying the character state or context before the model generates a response, for example to add situational context or reminders. The main reason is to add and remove states to the character that are relevant to the current conversation.",
                "Runs before each bond check, useful for modifying bond-related properties before the model evaluates them; note that if you want to update bonds for characters that are not participating use the 'Post any inference' instead and be sure is not a participating character.",
                "Runs after the inference cycle has completed, useful for updating character states based on the response generated; note that post inference runs at the end of all AI model inferences, so all Pre-infeences run first followed by their respective inference, post inference runs after all have completed.",
                "Runs after each inference from the participating characters have been completed and the inference cycle is done, this runs regardless of participation, useful for updating global states or properties that may affect multiple characters or the overall story. This function is dangerous, and inference should not be used here as it should be relegatd exclusively to heuristics without AI usage; this will run even if the character is nowhere present and if added as a world script it will run for every single character in the world.",
                "Bond modification rules specifies a rule to modify bond levels in character, this should return a string or string template or array of strings or string templates mwith the rules to use in the infererence prompt to modify bonds; this runs during the bond evaluation phase",
                "Bond general declaration specifies a general bond description and should return a string or string template; this is used to modify the behaviour of the character"
            ],
            "default": "Spawn",
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
            "default": "// Write your script here.\n",
            "placeholder": "// Write your script here.",
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
        },
        "freeze_states": {
            "type": "array",
            "title": "Freeze States",
            "description": "List of character states that this script does not allow to be modified, by the user configuration",
            "items": {
                "type": "string",
            },
        },
        "freeze_root_properties": {
            "type": "array",
            "title": "Freeze Root Properties",
            "description": "List of root character properties that this script does not allow to be modified, by the user configuration",
            "items": {
                "type": "string",
            },
        },
    },
    "required": ["name", "script"],
}

export default schema;