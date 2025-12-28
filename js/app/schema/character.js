export default {
    "title": "Character Schema",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "title": "Character Name",
            "description": "The name of the character.",
            "placeholder": "Alice",
            "maxLength": 100,
            "minLength": 1
        },
        "group": {
            "type": "string",
            "title": "Character Group",
            "description": "The group the character belongs to, used for organizing characters into folders.",
            "placeholder": "default",
            "maxLength": 100,
            "minLength": 1
        },
        "gender": {
            "type": "string",
            "title": "Character Gender",
            "description": "The gender of the character.",
            "enum": [
                "male",
                "female",
                "ambiguous"
            ]
        },
        "sex": {
            "type": "string",
            "title": "Character Sex",
            "description": "The sex of the character.",
            "enum": [
                "male",
                "female",
                "intersex"
            ]
        },
        "general": {
            "type": "string",
            "title": "General Information",
            "description": "Describes the character general behaviour and personality, it is in YOU format, you are, you do, as {{char}}",
            "maxLength": 1000,
            "minLength": 50,
            "placeholder": "You are {{char}} a brave and adventurous explorer, always seeking new challenges and experiences.\n\nYou have a strong sense of justice and are willing to help those in need.",
            "multiline": true
        },
        "short": {
            "type": "string",
            "title": "Short Description",
            "description": "A short mostly physical (on the surface) description of the character, used in lists and overviews.",
            "maxLength": 250,
            "minLength": 20,
            "placeholder": "A muscular woman with short brown hair and green eyes, wearing a leather jacket and boots."
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
            "description": "A percentage that determines how often per turn the character takes initiative in conversations with strangers",
            "minimum": 0,
            "maximum": 1,
            "default": 0.05,
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
        "autistic_response": {
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
        "left_behind_lost_potential": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "title": "Left Behind Lost Potential",
            "description": "When a character is left behind, this value determines a random roll, per inference for the character to get lost at the location, not being there anymore",
            "default": 0.05
        },
        "left_behind_remove_states": {
            "type": "array",
            "title": "Left Behind Remove States",
            "description": "States that are removed from the character when they are left behind.",
            "items": {
                "type": "string",
                "title": "State Name",
                "description": "The name of the state to remove when the character is left behind.",
                "is_state": true
            }
        },
        "left_behind_add_states": {
            "type": "array",
            "title": "Left Behind Add States",
            "description": "States that are added to the character when they are left behind.",
            "items": {
                "type": "string",
                "title": "State Name",
                "description": "The name of the state to add when the character is left behind.",
                "is_state": true
            }
        },
        "left_behind_lost_remove_states": {
            "type": "array",
            "title": "Left Behind Remove States",
            "description": "States that are removed from the character when they are left behind and they get lost.",
            "items": {
                "type": "string"
            }
        },
        "left_behind_lost_add_states": {
            "type": "array",
            "title": "Left Behind Add States",
            "description": "States that are added to the character when they are left behind and they get lost.",
            "items": {
                "type": "string"
            },
            "minItems": 1
        },
        "states": {
            "title": "Character States",
            "description": "Each state must be uppercase and unique.",
            "type": "object",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "general_description": {
                        "type": "string",
                        "title": "General Description",
                        "description": "A general description of the state, what it means for the character to be in this state. Use {{char}} as a placeholder for the character name.",
                    },
                    "relieving_description": {
                        "type": "string",
                        "title": "Relieving Description",
                        "description": "A description of the state when it is being relieved, Use {{char}} as a placeholder for the character name.",
                        "must_have_bool": "relief_uses_decay_rate"
                    },
                    "triggers_dead_end": {
                        "type": "string",
                        "title": "Triggers Dead End",
                        "description": "Describes a dead end that is triggered when this state activates."
                    },
                    "dead_end_is_death": {
                        "type": "boolean",
                        "title": "Dead End Is Death",
                        "description": "Indicates if this dead end is a death of character scenario.",
                        "must_have_string": "triggers_dead_end",
                    },
                    "triggers_dead_end_random_chance": {
                        "type": "number",
                        "title": "Triggers Dead End Random Chance",
                        "description": "The chance for this state to trigger the dead end when active per inference",
                        "minimum": 0,
                        "maximum": 1,
                        "percentage": true,
                        "must_have_string": "triggers_dead_end",
                    },
                    "triggers_dead_end_while_relieving_random_chance": {
                        "type": "number",
                        "title": "Triggers Dead End While Relieving Random Chance",
                        "description": "The chance for this state to trigger the dead end while relieving per inference",
                        "minimum": 0,
                        "maximum": 1,
                        "percentage": true,
                        "must_have_bool": "relief_uses_decay_rate",
                        "must_have_string": "triggers_dead_end",
                    },
                    "common_state_experienced_by_character": {
                        "type": "boolean",
                        "description": "Indicates if this state is commonly experienced by the character."
                    },
                    "has_custom_viewables": {
                        "type": "boolean",
                        "description": "Indicates if this state affects the character's viewables."
                    },
                    "custom_viewables_priority": {
                        "type": "number",
                        "description": "The priority of the custom viewables for this state, higher values indicate higher priority.",
                        "minimum": 0,
                        "maximum": 100,
                        "must_have_bool": "has_custom_viewables",
                    },
                    "random_spawn_rate": {
                        "type": "number",
                        "description": "The random spawn rate for this state.",
                        "minimum": 0,
                        "maximum": 1
                    },
                    "conflict_states": {
                        "type": "array",
                        "description": "States that conflict with this state, cannot be active at the same time.",
                        "items": {
                            "type": "string"
                        }
                    },
                    "required_states": {
                        "type": "array",
                        "description": "States that are required for this state to be available.",
                        "items": {
                            "type": "string"
                        }
                    },
                    "triggers_states": {
                        "type": "array",
                        "description": "States that are triggered when this state is activated.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "state": {
                                    "type": "string"
                                },
                                "intensity": {
                                    "type": "number",
                                    "minimum": 0,
                                    "maximum": 4
                                }
                            },
                            "required": [
                                "state",
                                "intensity"
                            ]
                        }
                    },
                    "relieves_states": {
                        "type": "array",
                        "description": "States that are relieved when this state is activated.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "state": {
                                    "type": "string"
                                },
                                "intensity_loss": {
                                    "type": "number",
                                    "minimum": -4,
                                    "maximum": 0
                                }
                            },
                            "required": [
                                "state",
                                "intensity_loss"
                            ]
                        }
                    },
                    "triggers_states_on_relief": {
                        "type": "array",
                        "description": "States that are triggered when this state is relieved.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "state": {
                                    "type": "string"
                                },
                                "intensity": {
                                    "type": "number",
                                    "minimum": 0,
                                    "maximum": 4
                                }
                            },
                            "required": [
                                "state",
                                "intensity"
                            ]
                        }
                    },
                    // can do some efficiency logic with this
                    // we can filter any states from being checked if any of the present party bond levels
                    // does not clear this criteria, also we may be interested in pushing negatives
                    // as in "character will not activate state x towards x"
                    "potential_causant_negative_prompt": {
                        "type": "string",
                        "description": "Prompt to inject towards a potential causant that does not meet the bond requirements for this state.",
                        "placeholder": "{{potential_causant}} has not built enough of a bond with {{char}} so x is offlimits."
                    },
                    "potential_causant_positive_prompt": {
                        "type": "string",
                        "description": "Prompt to inject towards a potential causant that meets the bond requirements for this state.",
                        "placeholder": "{{potential_causant}} has built a strong bond with {{char}} so x is possible."
                    },
                    "causant_min_bond_required": {
                        "type": "number",
                        "description": "Indicates the minimum bond level required for this state to be activated by a causant.",
                        "minimum": -100,
                        "maximum": 100,
                        "default": -100,
                    },
                    "causant_max_bond_required": {
                        "type": "number",
                        "description": "Indicates the maximum bond level required for this state to be activated by a causant.",
                        "minimum": -100,
                        "maximum": 100,
                        "default": 100,
                    },
                    "causant_min_2_bond_required": {
                        "type": "number",
                        "description": "Indicates the minimum second bond level required for this state to be activated by a causant agent.",
                        "minimum": 0,
                        "maximum": 100,
                        "default": 0,
                    },
                    "causant_max_2_bond_required": {
                        "type": "number",
                        "description": "Indicates the maximum second bond level required for this state to be activated by a causant agent.",
                        "minimum": 0,
                        "maximum": 100,
                        "default": 100,
                    },
                    "automatic_trigger": {
                        "type": "boolean",
                        "description": "Indicates if this state can be triggered automatically by the criteria of the LLM, useful for generic states that indicate emotions for example."
                    },
                    "automatic_reliever": {
                        "type": "boolean",
                        "description": "Indicates if this state can be relieved automatically by the criteria of the LLM, useful for generic states that indicate emotions for example."
                    },
                    "trigger_likelihood": {
                        "type": "number",
                        "description": "The likelihood for this state to be triggered manually per inference, a value between 0 and 1.",
                        "minimum": 0,
                        "maximum": 1,
                        "percentage": true,
                    },
                    "decay_rate_per_inference": {
                        "type": "number",
                        "description": "The decay rate per inference for this state, a value between 0 and 4.",
                        "minimum": 0,
                        "maximum": 4
                    },
                    "manual_triggers": {
                        "type": "array",
                        "description": "Manual triggers that can activate this state.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "if": {
                                    "type": "string",
                                    "description": "The ensure rule to add into the prompt to trigger this state, always starts as if, eg. {{other}} and {{char}} are alone together"
                                }
                            }
                        },
                        "minItems": 1
                    },
                    "manual_relievers": {
                        "type": "array",
                        "description": "Manual relievers that can deactivate this state.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "if": {
                                    "type": "string",
                                    "description": "The ensure rule to add into the prompt to relieve this state, always starts as if, eg. {{other}} comforts {{char}}"
                                }
                            }
                        }
                    },
                    "describes_action": {
                        "type": "boolean",
                        "description": "Indicates if this state describes an action the character takes, useful for states that indicate behaviours. When it is an action, there is no intensity associated with it.",
                    },
                    "starting_intensity": {
                        "type": "number",
                        "description": "The starting intensity of the state when it is first triggered, a value between 0 and 4.",
                        "minimum": 0,
                        "maximum": 4
                    },
                    "bond_mini": {
                        "type": "boolean",
                        "description": "Indicates if this state gives a mini bond bonus when active, useful for states that indicate positive emotions or behaviours.",
                    },
                    "relief_uses_decay_rate": {
                        "type": "boolean",
                        "description": "Indicates if the relief of this state uses the decay rate per inference to determine how much intensity is lost when relieved.",
                        "must_have_bool": "relief_uses_decay_rate",
                    },
                    "decay_rate_after_relief": {
                        "type": "number",
                        "description": "The decay rate applied after the state has been relieved, a value between 0 and 4.",
                        "minimum": 0,
                        "maximum": 4
                    },
                    "permanent": {
                        "type": "boolean",
                        "description": "Indicates if this state is permanent and cannot be relieved or decayed from the 1 value, useful for states that indicate permanent conditions or traits.",
                    },
                    "injury_and_death": {
                        "type": "boolean",
                        "description": "Indicates if this state is related to injury and death, useful for states that indicate critical conditions and we want to set in a separate inference step to avoid polluting other state logic.",
                    },
                    "track_causant": {
                        "type": "boolean",
                        "description": "Indicates if this state tracks who or what caused it to be activated, useful for states that may need to reference their causant later.",
                    },
                },
                "required": [
                    "common_state_experienced_by_character",
                    "has_custom_viewables"
                ]
            }
        },
        "bonds": {
            "title": "Character Bonds",
            "description": "Defines the bonds associated with the character.",
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "min_bond_level": {
                        "type": "integer",
                        "description": "The minimum bond level this bond applies to.",
                        "minimum": -100,
                        "maximum": 100
                    },
                    "max_bond_level": {
                        "type": "integer",
                        "description": "The maximum bond level this bond applies to.",
                        "minimum": -100,
                        "maximum": 100
                    },
                    "min_2nd_bond_level": {
                        "type": "integer",
                        "description": "The minimum second bond level this bond applies to.",
                        "minimum": 0,
                        "maximum": 100
                    },
                    "max_2nd_bond_level": {
                        "type": "integer",
                        "description": "The maximum second bond level this bond applies to.",
                        "minimum": 0,
                        "maximum": 100
                    },
                    "disable_states": {
                        "type": "array",
                        "description": "States to disable when this bond is active.",
                        "items": {
                            "type": "string"
                        },
                        "minItems": 1
                    },
                    "enable_states": {
                        "type": "array",
                        "description": "States to enable when this bond is active, only if they are disabled by default.",
                        "items": {
                            "type": "string"
                        },
                        "minItems": 1
                    },
                    "2nd_bond_increase_questions": {
                        "type": "array",
                        "description": "Rules for increasing the second bond level when this bond is active.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question": {
                                    "type": "string",
                                    "description": "The question to ask the user to increase the second bond level."
                                }
                            },
                            "required": [
                                "question"
                            ]
                        }
                    },
                    "description": {
                        "type": "string",
                        "description": "The description of the bond, use {{char}} and {{other}} as placeholders."
                    },
                    "state_overrides": {
                        "type": "object",
                        "description": "State prompt injections associated with this bond.",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "description": {
                                    "type": "string",
                                    "description": "The prompt injection text for this state, use {{char}} and {{other}} as placeholders; eg. {{char}} is now happy and will cheer {{other}}"
                                },
                                "initial_message": {
                                    "type": "string",
                                    "description": "If specified, forces an initial message action when this bond is activated, use {{char}} and {{other}} as placeholders; eg. {{char}} smiles at {{other}}"
                                },
                                "manual_triggers": {
                                    "type": "array",
                                    "description": "Manual triggers that can activate this state.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "if": {
                                                "type": "string",
                                                "description": "The ensure rule to add into the prompt to trigger this state, always starts as if, eg. {{other}} and {{char}} are alone together"
                                            }
                                        }
                                    },
                                    "minItems": 1
                                },
                                "manual_relievers": {
                                    "type": "array",
                                    "description": "Manual relievers that can deactivate this state.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "if": {
                                                "type": "string",
                                                "description": "The ensure rule to add into the prompt to relieve this state, always starts as if, eg. {{other}} comforts {{char}}"
                                            }
                                        }
                                    },
                                    "minItems": 1
                                }
                            },
                            "required": [
                                "description"
                            ]
                        }
                    }
                },
                "required": [
                    "min_bond_level",
                    "max_bond_level",
                    "min_2nd_bond_level",
                    "max_2nd_bond_level"
                ]
            },
            "minItems": 1
        },
        "emotions": {
            "title": "Character Emotions",
            "description": "Defines the emotions associated with the character.",
            "type": "object",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "The name of the emotion."
                    },
                    "common": {
                        "type": "boolean",
                        "description": "Indicates if this emotion is commonly experienced by the character."
                    },
                    "triggered_by_states": {
                        "type": "array",
                        "description": "States that can trigger this emotion.",
                        "items": {
                            "type": "string",
                            "description": "The name of the state that can trigger this emotion."
                        },
                        "minItems": 1
                    },
                },
                "required": [
                    "name"
                ]
            }
        }
    },
    "required": [
        "states",
        "bonds",
        "general",
        "initiative"
    ]
}