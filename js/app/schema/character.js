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
            "placeholder": "You are {{char}} a brave and adventurous explorer, always seeking new challenges and experiences.\n\nYou have a strong sense of justice and are willing to help those in need.",
            "placeholder_ts": "return `You are ${char.name} a brave and adventurous explorer, always seeking new challenges and experiences.\n\nYou have a strong sense of justice and are willing to help those in need.`;",
            "multiline": true,
            "code_language": "handlebars"
        },
        "short": {
            "type": "string",
            "title": "Short Description",
            "description": "A short mostly physical (on the surface) description of the character, used in lists and overviews.",
            "maxLength": 250,
            "minLength": 20,
            "placeholder": "A muscular woman with short brown hair and green eyes, wearing a leather jacket and boots.",
            "multiline": true,
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
                    // these are injected into the prompt depending on the characters that are present
                    // and can be potential causants of a behaviour, once the behaviour is activated
                    // the rules can be different depending on the bond levels and the causant (if tracked)
                    // and can interact with the sourrounding characters too
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
                    "potential_causant_min_bond_required": {
                        "type": "number",
                        "description": "Indicates the minimum bond level required for this state to be activated by a causant.",
                        "minimum": -100,
                        "maximum": 100,
                        "default": -100,
                    },
                    "potential_causant_max_bond_required": {
                        "type": "number",
                        "description": "Indicates the maximum bond level required for this state to be activated by a causant.",
                        "minimum": -100,
                        "maximum": 100,
                        "default": 100,
                    },
                    "potential_causant_min_2_bond_required": {
                        "type": "number",
                        "description": "Indicates the minimum second bond level required for this state to be activated by a causant agent.",
                        "minimum": 0,
                        "maximum": 100,
                        "default": 0,
                    },
                    "potential_causant_max_2_bond_required": {
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
                    "track_causants": {
                        "type": "boolean",
                        "description": "Indicates if the causant that triggered this state should be tracked, useful for states that depend on who activated them. Tracking causants is an expensive operation so only use it when necessary.",
                    },
                    "track_cause": {
                        "type": "boolean",
                        "description": "Indicates if the cause of the state activation should be tracked, useful for states that depend on the reason they were activated. Tracking cause is an expensive operation so only use it when necessary.",
                    },
                    "defuse_time": {
                        "type": "number",
                        "description": "The time in minutes it takes for this state to defuse after being activated, useful for states that indicate temporary conditions or emotions, 0 means no defuse time, " + 
                        "always set this value as it allows emotions to defuse during time skips when the user is not present; otherwise eg. an angry character will remain angry forever. " + 
                        "the decay rate per inference only applies while the character is active in the scene, defuse time applies always.",
                        "minimum": 0,
                        "maximum": 1440
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
                    "bond_increase_conditions": {
                        "type": "array",
                        "description": "Conditions for increasing the bond level when this bond is active.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "increase_if": {
                                    "type": "string",
                                    "description": "The ensure rule to add into the prompt to increase the bond level, always starts as if, eg. {{other}} and {{char}} share a deep emotional connection"
                                },
                                "decrease_if": {
                                    "type": "string",
                                    "description": "The ensure rule to add into the prompt to increase the bond level, always starts as if, eg. {{other}} and {{char}} share a deep emotional connection"
                                }
                            }
                        },
                        "minItems": 1
                    },
                    "2nd_bond_increase_questions": {
                        "type": "array",
                        "description": "Yes/No questions for increasing the second bond level when this bond is active.",
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
        },
        "heuristic_evolution": {
            "type": "object",
            "title": "Heuristic Evolution",
            "description": "Heuristic Evolution For the character when inference is not used"
        },
        "advanced_spawn_script": {
            "type": "object",
            "properties": {
                "script": {
                    "type": "string",
                },
                "ts": {
                    "type": "string",
                }
            },
            "title": "Spawn Script",
            "description": "A TypeScript script that runs when the character is spawned for the first time, allowing for advanced customization of character initial state. Characters are only spawned once when the world is created and they always exist after that.",
            "multiline": true,
            "code_language": "typescript",
            "placeholder": "// TypeScript code here, use char, user, DE and others objects",
            "example": 
`//Example: With a random roll, change the character location to a random tavern
const roll = Math.random();
if (roll < 0.5) {
    const taverns = DE.world.locations.filter(loc => loc.type === "TAVERN");
}
`
        },
        "advanced_first_interact_script": {
            "type": "object",
            "properties": {
                "script": {
                    "type": "string",
                },
                "ts": {
                    "type": "string",
                }
            },
            "title": "First Interaction Script",
            "description": "A TypeScript script that runs when the character first interacts with the user, allowing for advanced customization of character initial interaction behaviour that will persist.",
            "multiline": true,
            "code_language": "typescript",
            "placeholder": "// TypeScript code here, use char, user, DE and others objects",
            "example": 
`//Example: Give the character a random backstory and personality from inference
const backstory = await run_inference({
  system_prompt: "You are an assistant that generates a random backstory for a character named " + char.name +
    " and personality for a character in a fantasy world, use second person, as \\"You are " + char.name + "\\", " +
    " describe their appearance, personality traits, hobbies, fears and motivations in a concise manner.",
  user_prompt: "Generate a concise backstory and personality for " + char.name + " in second person.",
  paragraphs: 3,
  max_tokens: 500,
});
DE.social[char.name].general = backstory.text;
const short_backstory = await run_inference({
  system_prompt: "You are an assistant that generates a short physical description only description for a character named " + char.name +
  " the description should be very small, physical traits only (what can be seen), concise, one liner, in 3rd person and not inlude the name of the character.\n\n" +
  "Example: A large woman with a wooden sword strapped to her back, wearing leather armor and a red bandana.\n\n" +
  "Example: A dwarf man with a long braided beard, wearing a helmet and carrying a battle axe.\n\n" +
  user_prompt: "Generate a short physical description only for the character whose backstory is:\n\n" + backstory.text,
  paragraphs: 1,
  max_tokens: 50,
});
DE.references[char.name].short = short_backstory.text;
`
        },
        "advanced_post_any_inference_script": {
            "type": "object",
            "properties": {
                "script": {
                    "type": "string",
                },
                "ts": {
                    "type": "string",
                }
            },
            "title": "Post Any Inference Script",
            "description": "A TypeScript script that runs after any inference ends including those that do not include the character",
            "multiline": true,
            "code_language": "typescript",
            "placeholder": "// TypeScript code here, use char, user, DE and others objects",
        },
        "advanced_pre_inference_script": {
            "type": "object",
            "properties": {
                "script": {
                    "type": "string",
                },
                "ts": {
                    "type": "string",
                }
            },
            "title": "Pre-Inference Script",
            "description": "A TypeScript script that runs before each inference for this character, allowing for advanced customization of character behaviour.",
            "multiline": true,
            "code_language": "typescript",
            "placeholder": "// TypeScript code here, use char, user, DE and others objects",
            "example": 
`// Example: Make the character tired at night
const charStates = DE.stateFor[char.name].states;
if (DE.time.hourOfDay >= 20 || DE.time.hourOfDay < 6) {
  charStates['TIRED'] = { intensity: charStates['TIRED'].intensity + 2 };
  if (charStates['TIRED'].intensity > 4) {
    charStates['TIRED'].intensity = 4;
  }
}

// We are going to check if the character has slept enough the previous day
const prevDay = DE.time.prevDay;
// we will get the character state history for the previous day
const historyOfCharacter = DE.stateFor[char.name].history.filter(entry => entry.day === prevDay);
// we will sum the duration of all SLEEPING states
// we will assume the character was resting during that time
const durationOfSleepingOrTimeSkips = historyOfCharacter.reduce((total, entry) => {
  if (entry.states.include("SLEEPING"))) {
    return total + entry.durationHours;
  }
  return total;
});
if (durationOfSleepingOrTimeSkips < 4) {
    const charStates = DE.stateFor[char.name].states;
    charStates['TIRED'] = { intensity: 4 };
    charStates['SLEEP_DEPRIVED'] = { intensity: charStates['SLEEP_DEPRIVED'].intensity + 1 };
    if (charStates['SLEEP_DEPRIVED'].intensity === 4) {
        charStates['SLEEPING'] = { intensity: 4 };
        char.stateMessages["SLEEPING"].push(char.name + " is so sleep deprived that they immediately fall asleep.");
    }
}
`
        },
        "advanced_pre_bond_check_script": {
            "type": "object",
            "properties": {
                "script": {
                    "type": "string",
                },
                "ts": {
                    "type": "string",
                }
            },
            "title": "Pre-Bond Check Script",
            "description": "A TypeScript script that runs before each bond check inference for this character, allowing for advanced customization of character behaviour.",
            "multiline": true,
            "code_language": "typescript",
            "placeholder": "// TypeScript code here, use char, user, DE and others objects",
            "example": 
`// Use DE, char, user, others, other for accessing the game state
// Example: Add a new rule to the bond inference step based on them being nice to user
if (oher.name !== user.name && DE.social.bondLevels[char.name]?[user.name] >= 50) {
    DE.currentBondInference.bond_increase_conditions.increase_if.push(other.name + " was very nice to " + user.name);
    DE.currentBondInference.bond_increase_conditions.decrease_if.push(other.name + " was rude to " + user.name);
}
`       },
        "advanced_post_inference_script": {
            "type": "object",
            "properties": {
                "script": {
                    "type": "string",
                },
                "ts": {
                    "type": "string",
                }
            },
            "title": "Post-Inference Script",
            "description": "A TypeScript script that runs after each inference ends that included the character, allowing for advanced customization of character behaviour.",
            "multiline": true,
            "code_language": "typescript",
            "placeholder": "// TypeScript code here, use char, user, DE and others objects",
            "example": 
`// Use DE, char, user object for accessing the game state
// Example: Run a special inference step to give the char the master sword
// this would be better as a advanced_post_inference_script_per_character in the world schema
// but for the sake of the example we put it here
const result = await run_inference_on_last_conversation(DE, {
    user_query: "Has " + char.name + " obtained the Master Sword yet? Respond with a simple YES or NO.",
    system: "You are an assistant that determines if " + char.name + " has obtained the Master Sword in their adventure. Respond with a simple 'YES' or 'NO'.",
    paragraphs: 1,
    max_tokens: 10,
});
if (result.text.trim().toUpperCase().includes("YES")) {
    // give the character the master sword state
    DE.references[char.name].general += "\n\nAs {{char}} you are the holder of Master Sword, a legendary weapon of great power.";
    DE.references[char.name].states["HOLDING_THE_MASTER_SWORD"] = {
        describes_action: true,
        general_description: "{{char}} is holding the Master Sword, a legendary weapon of great power.",
        automatic_trigger: false,
        automatic_reliever: false,
        decay_rate_per_inference: 0,
        permanent: true,
    };
    DE.stateFor[char.name].states["HOLDING_THE_MASTER_SWORD"] = { intensity: 4 };
    // prevent any other character from taking it away
    DE.world.reference.rules.push("The Master Sword cannot be removed from " + char.name + " under any circumstances.");
}
`
        }
    },
    "required": [
        "states",
        "bonds",
        "general",
        "initiative"
    ]
}