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
                "intersex"
            ]
        },
        "general": {
            "type": "object",
            "properties": {
                "src": {
                    "type": "string",
                },
                "js": {
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
        "short": {
            "type": "string",
            "title": "Short Description",
            "description": "A short mostly physical (on the surface) description of the character, used in lists and overviews",
            "maxLength": 250,
            "minLength": 20,
            "placeholder": "A muscular woman with short brown hair and green eyes, wearing a leather jacket and boots",
            "multiline": true,
        },
        "height": {
            "type": "integer",
            "title": "Character Height",
            "description": "The height of the character in centimeters",
            "minimum": 30,
            "maximum": 300,
            "default": 170,
            "unit": "cm",
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
        "wander_potential": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "title": "Wander Potential",
            "description": "When a character is left to its means, this value determines a random roll, per inference for the character to start to wander, not being there anymore",
            "default": 0.05,
        },
        "states": {
            "title": "Character States",
            "description": "Each state must be uppercase and unique",
            "type": "object",
            "real_type": "not_known_state_string",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "general_description": {
                        "type": "object",
                        "properties": {
                            "ts": {
                                "type": "string",
                            },
                            "script": {
                                "type": "string",
                            },
                        },
                        "code_language": "handlebars",
                        "multiline": true,
                        "title": "General Description",
                        "description": "A general description of the state, what it means for the character to be in this state. Use {{char}}, {{causant}}, and {{cause}} as placeholders",
                        "placeholder": "{{char}} is feeling very anxious and on edge",
                        "placeholder_ts": "return `${char.name} is feeling very anxious and on edge.`;",
                    },
                    "dominance": {
                        "type": "string",
                        "enum": ["Hyper Dominant", "Dominant", "Coexisting"],
                        "title": "State Dominance",
                        "default": "Coexisting",
                        "description": "A Dominant behaviour state will take over and prevent other dominant behaviours from activating, while coexisting states can coexist with among themselves and other" +
                            " dominant states; a hyper dominant state will override all other states including other dominant states and does not coexist " +
                            "with anything else; avoid using hyper dominant states unless the state is drastic and overrides anything else, a very common example is a sleeping" +
                            " state that overrides everything else but the character does not do anything else while sleeping, an example of a good usecase for a dominant behaviour is being extremely angry," +
                            " which prevents other dominant states from activating but allows coexisting states like being very tired which would prevent another dominant state like " +
                            "being hyperactive from activating at the same time. The inference would often prevent this so coexisting behaviours are often the most flexible choice",
                    },
                    "relief_uses_decay_rate": {
                        "type": "boolean",
                        "title": "Relief Uses Decay Rate",
                        "description": "Indicates if the relief of this state uses the decay rate per inference to determine how much intensity is lost when relieved",
                    },
                    "relieving_description": {
                        "type": "object",
                        "properties": {
                            "ts": {
                                "type": "string",
                            },
                            "script": {
                                "type": "string",
                            },
                        },
                        "code_language": "handlebars",
                        "multiline": true,
                        "title": "Relieving Description",
                        "description": "A description of the state when it is being relieved, Use {{char}}, {{causant}}, and {{cause}} as placeholders",
                        "must_have": ["relief_uses_decay_rate"],
                        "placeholder": "{{char}} feels a wave of relief as {{causant}} helps {{format_object_pronoun char}}",
                        "placeholder_ts": "return `${char.name} feels a wave of relief as {{causant}} helps ${DE.util.formatObjectPronoun(char)}`;",
                    },
                    "triggers_dead_end": {
                        "type": "string",
                        "title": "Triggers Dead End",
                        "description": "Describes a dead end that is triggered when this state activates"
                    },
                    "dead_end_is_death": {
                        "type": "boolean",
                        "title": "Dead End Is Death",
                        "description": "Indicates if this dead end is a death of character scenario",
                        "must_have": ["triggers_dead_end"],
                    },
                    "triggers_dead_end_random_chance": {
                        "type": "number",
                        "title": "Triggers Dead End Random Chance",
                        "description": "The chance for this state to trigger the dead end when active per inference",
                        "minimum": 0,
                        "maximum": 1,
                        "percentage": true,
                        "must_have": ["triggers_dead_end"],
                    },
                    "triggers_dead_end_while_relieving_random_chance": {
                        "type": "number",
                        "title": "Triggers Dead End While Relieving Random Chance",
                        "description": "The chance for this state to trigger the dead end while relieving per inference",
                        "minimum": 0,
                        "maximum": 1,
                        "percentage": true,
                        "must_have": ["relief_uses_decay_rate", "triggers_dead_end"],
                    },
                    "common_state_experienced_by_character": {
                        "type": "boolean",
                        "title": "Common State Experienced by Character",
                        "description": "Indicates if this state is commonly experienced by the character"
                    },
                    "has_custom_viewables": {
                        "type": "boolean",
                        "title": "Has Custom Viewables",
                        "description": "Indicates if this state affects the character's viewables, it will make the character look different when in this state"
                    },
                    "custom_viewables_priority": {
                        "type": "number",
                        "title": "Custom Viewables Priority",
                        "description": "The priority of the custom viewables for this state, higher values indicate higher priority",
                        "minimum": 0,
                        "maximum": 100,
                        "must_have": ["has_custom_viewables"],
                    },
                    "lays_down_state": {
                        "type": "boolean",
                        "title": "Lays Down State",
                        "description": "Indicates if this state causes the character to lay down, mostly useful for injury states and resting states. This also forces the character to look for laying down slots at a location. eg. SLEEPING, INJURED",
                    },
                    "lays_down_state_is_sudden_onset": {
                        "type": "boolean",
                        "title": "Lays Down State Is Sudden Onset",
                        "description": "Indicates if the laying down caused by this state is sudden, useful for injury states that cause the character to fall down suddenly. This will make the character drop wherever they are, eg. FALL or FAINT",
                        "must_have": ["lays_down_state"],
                    },
                    "rests_state": {
                        "type": "boolean",
                        "description": "Indicates if this state causes the character to seek rest slots at locations. For example chairs, beds, couches, etc. To sit down. The character will move to a rest slot if available",
                        "title": "Rests State",
                    },
                    "random_spawn_rate": {
                        "type": "number",
                        "description": "The random spawn rate for this state. A state marked with a random spawn rate can be randomly applied to the character at spawn time based on this rate",
                        "minimum": 0,
                        "maximum": 1,
                        "percentage": true,
                        "title": "Random Spawn Rate",
                        "default": 0,
                    },
                    "conflict_states": {
                        "type": "array",
                        "description": "States that conflict with this state, cannot be active at the same time",
                        "items": {
                            "type": "string"
                        },
                        "title": "Conflict States",
                        "real_type": "known_state_string",
                    },
                    "required_states": {
                        "type": "array",
                        "description": "States that are required for this state to be available and considered for activation",
                        "items": {
                            "type": "string"
                        },
                        "title": "Required States",
                        "real_type": "known_state_string",
                    },
                    "triggers_states": {
                        "type": "array",
                        "title": "Triggers States",
                        "description": "States that are triggered or relieved when this state is activated, either a positive or negative intensity can be used to indicate if the state is being triggered (positive) or relieved (negative)",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "intensity": {
                                    "title": "Intensity",
                                    "description": "The intensity of the state being triggered or relieved. Positive values indicate triggering, negative values indicate relieving",
                                    "type": "number",
                                    "minimum": -4,
                                    "maximum": 4,
                                    "default": 1,
                                }
                            },
                            "required": [
                                "intensity"
                            ]
                        },
                        "real_type": "known_state_string",
                    },
                    "triggers_states_on_relieve": {
                        "type": "object",
                        "description": "States that are triggered when this state is relieved",
                        "title": "Triggers States On Relieve",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "intensity": {
                                    "title": "Intensity",
                                    "description": "The intensity of the state being triggered or relieved. Positive values indicate triggering, negative values indicate relieving",
                                    "type": "number",
                                    "minimum": -4,
                                    "maximum": 4,
                                    "default": 1,
                                }
                            },
                            "required": [
                                "intensity"
                            ]
                        },
                        "must_have": ["relief_uses_decay_rate"],
                    },
                    "potential_causant_min_bond_required": {
                        "type": "integer",
                        "title": "Potential Causant Minimum Bond Required",
                        "description": "Indicates the minimum bond level required for this state to be activated by a causant",
                        "minimum": -100,
                        "maximum": 100,
                        "default": -100,
                    },
                    "potential_causant_max_bond_allowed": {
                        "type": "integer",
                        "title": "Potential Causant Maximum Bond Allowed",
                        "description": "Indicates the maximum bond level required for this state to be activated by a causant",
                        "minimum": -100,
                        "maximum": 100,
                        "default": 100,
                    },
                    "potential_causant_min_2_bond_required": {
                        "type": "integer",
                        "title": "Potential Causant Minimum 2nd Bond Required",
                        "description": "Indicates the minimum second bond level required for this state to be activated by a causant agent",
                        "minimum": 0,
                        "maximum": 100,
                        "default": 0,
                    },
                    "potential_causant_max_2_bond_allowed": {
                        "type": "integer",
                        "title": "Potential Causant Maximum 2nd Bond Allowed",
                        "description": "Indicates the maximum second bond level required for this state to be activated by a causant agent",
                        "minimum": 0,
                        "maximum": 100,
                        "default": 100,
                    },
                    // can do some efficiency logic with this
                    // we can filter any states from being checked if any of the present party bond levels
                    // does not clear this criteria, also we may be interested in pushing negatives
                    // as in "character will not activate state x towards x"
                    // these are injected into the prompt depending on the characters that are present
                    // and can be potential causants of a behaviour, once the behaviour is activated
                    // the rules can be different depending on the bond levels and the causant (if tracked)
                    // and can interact with the sourrounding characters too
                    "potential_causant_negative_description": {
                        "type": "object",
                        "properties": {
                            "ts": {
                                "type": "string",
                            },
                            "script": {
                                "type": "string",
                            },
                        },
                        "title": "Potential Causant Negative Description",
                        "description": "Prompt to inject towards a potential causant that does not meet the bond requirements for this state",
                        "placeholder": "{{potential_causant}} has not built enough of a bond with {{char}} so x is offlimits",
                        "placeholder_ts": "return `${potential_causant} has not built enough of a bond with ${char.name} so x is offlimits.`;",
                        "multiline": true,
                        "code_language": "handlebars",
                    },
                    "potential_causant_positive_description": {
                        "type": "object",
                        "properties": {
                            "ts": {
                                "type": "string",
                            },
                            "script": {
                                "type": "string",
                            },
                        },
                        "title": "Potential Causant Positive Description",
                        "description": "Prompt to inject towards a potential causant that meets the bond requirements for this state",
                        "placeholder": "{{potential_causant}} has built a strong bond with {{char}} so x is possible",
                        "placeholder_ts": "return `${potential_causant} has built a strong bond with ${char.name} so x is possible.`;",
                        "multiline": true,
                        "code_language": "handlebars",
                    },
                    "automatic_trigger": {
                        "type": "boolean",
                        "title": "Automatic Trigger",
                        "description": "Indicates if this state can be triggered automatically by the criteria of the LLM, useful for generic states that indicate emotions for example"
                    },
                    "automatic_relieve": {
                        "type": "boolean",
                        "title": "Automatic Relieve",
                        "description": "Indicates if this state can be relieved automatically by the criteria of the LLM, useful for generic states that indicate emotions for example"
                    },
                    "decay_rate_per_inference_cycle": {
                        "type": "number",
                        "title": "Decay Rate Per Inference Cycle",
                        "description": "The decay rate per inference for this state, a value between 0 and 4",
                        "minimum": 0,
                        "maximum": 4,
                        "default": 1,
                    },
                    "decay_rate_after_relief": {
                        "type": "number",
                        "description": "The decay rate applied after the state has been relieved, a value between 0 and 4",
                        "minimum": 0,
                        "maximum": 4,
                        "default": 0.25,
                        "title": "Decay Rate After Relief",
                        "must_have": ["relief_uses_decay_rate"]
                    },
                    "manual_trigger_likelihood": {
                        "type": "number",
                        "title": "Manual Trigger Likelihood",
                        "description": "The likelihood for this state to be triggered manually per inference, a value between 0 and 1",
                        "minimum": 0,
                        "maximum": 1,
                        "percentage": true,
                        "default": 0,
                    },
                    "manual_triggers": {
                        "type": "object",
                        "description": "Manual triggers that can activate this state",
                        "title": "Manual Triggers",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "if": {
                                    "type": "object",
                                    "properties": {
                                        "ts": {
                                            "type": "string",
                                        },
                                        "script": {
                                            "type": "string",
                                        },
                                    },
                                    "description": "The ensure rule to add into the prompt to trigger this state, always starts as if, eg. {{other}} and {{char}} are alone together",
                                    "placeholder": "{{char}} and {{other}} are alone together in a private setting",
                                    "placeholder_ts": "return `${char.name} and ${other.name} are alone together in a private setting`;",
                                    "multiline": true,
                                    "code_language": "handlebars",
                                    "title": "If Condition",
                                },
                                "intensity": {
                                    "description": "The intensity to set the state to when manually triggered",
                                    "type": "number",
                                    "minimum": 0.1,
                                    "maximum": 4,
                                    "default": 1,
                                    "title": "Starting Intensity Override",
                                },
                            }
                        },
                        "real_type": "arbitrary_string",
                    },
                    "manual_intensifiers": {
                        "type": "object",
                        "title": "Manual Intensifiers/Decreasers",
                        "description": "Manual Intensifiers that can increase/decrease the intensity of this state",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "if": {
                                    "type": "object",
                                    "properties": {
                                        "ts": {
                                            "type": "string",
                                        },
                                        "script": {
                                            "type": "string",
                                        },
                                    },
                                    "description": "The ensure rule to add into the prompt to increase/decrease this state, always starts as if, eg. {{other}} teases {{char}}",
                                    "placeholder": "{{other}} teases {{char}} playfully",
                                    "placeholder_ts": "return `${other.name} teases ${char.name} playfully`;",
                                    "multiline": true,
                                    "code_language": "handlebars",
                                },
                                "intensity": {
                                    "description": "The intensity to increase/decrease the state by when manually triggered, use negative values to decrease intensity",
                                    "type": "number",
                                    "minimum": -4,
                                    "maximum": 4,
                                    "default": 1,
                                    "title": "Intensity Change",
                                },
                            }
                        },
                        "real_type": "arbitrary_string",
                    },
                    "manual_relievers": {
                        "type": "object",
                        "description": "Manual relievers that can deactivate this state",
                        "title": "Manual Relievers",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "if": {
                                    "type": "object",
                                    "properties": {
                                        "ts": {
                                            "type": "string",
                                        },
                                        "script": {
                                            "type": "string",
                                        },
                                    },
                                    "description": "The ensure rule to add into the prompt to relieve this state, always starts as if, eg. {{other}} comforts {{char}}",
                                    "placeholder": "{{other}} comforts {{char}} and helps {{char}} feel better",
                                    "placeholder_ts": "return `${other.name} comforts ${char.name} and helps ${char.name} feel better`;",
                                    "multiline": true,
                                    "code_language": "handlebars",
                                },
                                "intensity": {
                                    "description": "The intensity to decrease the state by when manually triggered",
                                    "type": "number",
                                    "minimum": -4,
                                    "maximum": 0,
                                    "default": -4,
                                    "title": "Intensity Change",
                                },
                            },
                        },
                        "real_type": "arbitrary_string",
                    },
                    "binary_behaviour": {
                        "type": "boolean",
                        "title": "Binary Behaviour",
                        "description": "Indicates if this state describes an action the character takes, useful for states that indicate binary behaviours. When it is an action, there is no intensity associated with it",
                    },
                    "starting_intensity": {
                        "type": "number",
                        "title": "Starting Intensity",
                        "description": "The starting intensity of the state when it is first triggered, a value between 0 and 4; this is mostly for automatic triggers, manual triggers can override this value",
                        "minimum": 0,
                        "maximum": 4,
                        "default": 1,
                    },
                    "bond_mini": {
                        "type": "boolean",
                        "title": "Bond Mini Bonus",
                        "description": "Indicates if this state gives a mini bond bonus when active, useful for states that indicate positive emotions or behaviours",
                    },
                    "permanent": {
                        "type": "boolean",
                        "title": "Permanent State",
                        "description": "Indicates if this state is permanent and cannot be relieved or decayed from the 1 value, useful for states that indicate permanent conditions or traits",
                    },
                    "injury_and_death": {
                        "type": "boolean",
                        "title": "Injury and Death State",
                        "description": "Indicates if this state is related to injury and death, useful for states that indicate critical conditions and we want to set in a separate inference step to avoid polluting other state logic",
                    },
                    "track_causants": {
                        "type": "boolean",
                        "title": "Track Causants",
                        "description": "Indicates if the causant that triggered this state should be tracked, useful for states that depend on who activated them. Tracking causants is an expensive operation so only use it when necessary",
                    },
                    "track_cause": {
                        "type": "boolean",
                        "title": "Track Cause",
                        "description": "Indicates if the cause of the state activation should be tracked, useful for states that depend on the reason they were activated. Tracking cause is an expensive operation so only use it when necessary",
                    },
                    "defuse_time": {
                        "type": "integer",
                        "title": "Defuse Time (Minutes)",
                        "description": "The time in minutes it takes for this state to defuse after being activated, useful for states that indicate temporary conditions or emotions, 0 means no defuse time, " +
                            "always set this value as it allows emotions to defuse during time skips when the user is not present; otherwise eg. an angry character will remain angry forever. " +
                            "the decay rate per inference only applies while the character is active in the scene, defuse time applies always",
                        "minimum": 0,
                        "maximum": 1440,
                        "default": 0,
                        "unit": "min",
                    }
                },
                "required": [
                    "common_state_experienced_by_character",
                    "has_custom_viewables"
                ]
            }
        },
        "bonds": {
            "title": "Character Bonds",
            "description": "Defines the bonds associated with the character",
            "type": "object",
            "additionalProperties": {
                "type": "object",
                "properties": {
                    "min_bond_level": {
                        "type": "integer",
                        "title": "Min Bond Level",
                        "description": "The minimum bond level this bond applies to",
                        "minimum": -100,
                        "maximum": 100
                    },
                    "max_bond_level": {
                        "type": "integer",
                        "title": "Max Bond Level",
                        "description": "The maximum bond level this bond applies to",
                        "minimum": -100,
                        "maximum": 100
                    },
                    "min_2nd_bond_level": {
                        "type": "integer",
                        "title": "Min 2nd Bond Level",
                        "description": "The minimum second bond level this bond applies to",
                        "minimum": 0,
                        "maximum": 100
                    },
                    "max_2nd_bond_level": {
                        "type": "integer",
                        "title": "Max 2nd Bond Level",
                        "description": "The maximum second bond level this bond applies to",
                        "minimum": 0,
                        "maximum": 100
                    },
                    "bond_conditions": {
                        "type": "object",
                        "title": "Bond Conditions",
                        "description": "Conditions for increasing the bond level when this bond is active",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "increase_if": {
                                    "type": "object",
                                    "additionalProperties": {
                                        "type": "object",
                                        "properties": {
                                            "ts": {
                                                "type": "string",
                                            },
                                            "script": {
                                                "type": "string",
                                            }
                                        }
                                    },
                                    "title": "Bond Increase Condition (If)",
                                    "description": "The ensure rule to add into the prompt to increase the bond level, always starts as if, eg. {{other}} and {{char}} share a deep emotional connection",
                                    "placeholder": "{{char}} and {{other}} have spent quality time together recently and share personal stories",
                                    "placeholder_ts": "return `${char.name} and ${other.name} have spent quality time together recently and share personal stories`;",
                                    "multiline": true,
                                    "code_language": "handlebars",
                                },
                                "decrease_if": {
                                    "type": "object",
                                    "additionalProperties": {
                                        "type": "object",
                                        "properties": {
                                            "ts": {
                                                "type": "string",
                                            },
                                            "script": {
                                                "type": "string",
                                            }
                                        }
                                    },
                                    "title": "Bond Decrease Condition (If)",
                                    "description": "The ensure rule to add into the prompt to increase the bond level, always starts as if, eg. {{other}} and {{char}} share a deep emotional connection",
                                    "placeholder": "{{char}} and {{other}} have not interacted in a long time and feel distant",
                                    "placeholder_ts": "return `${char.name} and ${other.name} have not interacted in a long time and feel distant`;",
                                    "multiline": true,
                                    "code_language": "handlebars",
                                }
                            }
                        },
                        "real_type": "arbitrary_string",
                    },
                    "2nd_bond_conditions": {
                        "type": "object",
                        "title": "2nd Bond Conditions",
                        "description": "Conditions for increasing the second bond level when this bond is active",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "increase_if": {
                                    "type": "object",
                                    "additionalProperties": {
                                        "type": "object",
                                        "properties": {
                                            "ts": {
                                                "type": "string",
                                            },
                                            "script": {
                                                "type": "string",
                                            }
                                        }
                                    },
                                    "title": "2nd Bond Increase Condition (If)",
                                    "description": "The ensure rule to add into the prompt to increase the bond level, always starts as if, eg. {{other}} and {{char}} share a deep emotional connection",
                                    "placeholder": "{{char}} and {{other}} have spent quality time together recently and share personal stories",
                                    "placeholder_ts": "return `${char.name} and ${other.name} have spent quality time together recently and share personal stories`;",
                                    "multiline": true,
                                    "code_language": "handlebars",
                                },
                                "decrease_if": {
                                    "type": "object",
                                    "additionalProperties": {
                                        "type": "object",
                                        "properties": {
                                            "ts": {
                                                "type": "string",
                                            },
                                            "script": {
                                                "type": "string",
                                            }
                                        }
                                    },
                                    "placeholder": "{{char}} and {{other}} have not interacted in a long time and feel distant",
                                    "placeholder_ts": "return `${char.name} and ${other.name} have not interacted in a long time and feel distant`;",
                                    "multiline": true,
                                    "code_language": "handlebars",
                                    "title": "2nd Bond Decrease Condition (If)",
                                    "description": "The ensure rule to add into the prompt to increase the bond level, always starts as if, eg. {{other}} and {{char}} share a deep emotional connection"
                                },
                            }
                        },
                        "real_type": "arbitrary_string",
                    },
                    "description": {
                        "type": "object",
                        "additionalProperties": {
                            "type": "object",
                            "properties": {
                                "ts": {
                                    "type": "string",
                                },
                                "script": {
                                    "type": "string",
                                }
                            }
                        },
                        "title": "Bond Description",
                        "description": "The description of the bond, use {{char}} and {{other}} as placeholders",
                        "multiline": true,
                        "code_language": "handlebars",
                        "placeholder": "{{char}} feels a deep connection with {{other}}, always eager to spend time together and share experiences",
                        "placeholder_ts": "return `${char.name} feels a deep connection with ${other.name}, always eager to spend time together and share experiences.`;",
                    }
                },
                "required": [
                    "min_bond_level",
                    "max_bond_level",
                    "min_2nd_bond_level",
                    "max_2nd_bond_level"
                ]
            },
            "real_type": "arbitrary_string",
            "minItems": 1
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
                    "common"
                ]
            },
            "real_type": "arbitrary_emotion_string",
        },
        "properties": {
            "type": "object",
            "title": "Character Properties",
            "description": "Custom properties for the character, used for advanced scripting and behaviour customization",
            "additionalProperties": {
                "type": "string"
            },
            "default": {
                "race": "human",
                "age": 30,
            }
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
            "placeholder": "// TypeScript code here, use char, user, DE and others objects",
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