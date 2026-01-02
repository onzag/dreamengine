import schema from '../schema/character.js';
import { character, social, world, utils, specials } from '../schema/variables.js';
import { playCancelSound, playConfirmSound, playHoverSound, playPauseSound } from '../sound.js';

function escapeHTML(str) {
    if (typeof str === "undefined" || str === null) {
        return '';
    }
    if (typeof str !== 'string') {
        return str;
    }
    return str.replace(/[&<>"']/g, function (match) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return escapeMap[match];
    });
}

const BASIC_STATES = (child, non_sapient_animal, extra_sfw, extra_nsfw) => ({
    "Hungry": {
        "general_description": child ?
            "{{char}} is feeling hungry and needs to eat, {{char_pronoun}} may become cranky if not fed in time, {{char_pronoun}} will seek out for their caregiver or trusted adult to provide food for {{char_object_pronoun}}" :
            "{{char}} feels the need for food to sustain their energy and health",
        "random_spawn_rate": 0.01,
        "automatic_trigger": true,
        "automatic_reliever": false,
        "manual_relievers": [
            "{{char}} has had a meal or snack",
        ],
        "triggers_states_on_relief": [
            child ? { "state": "Tired", "intensity": 1 } : null,
            { "state": "Satisfied", "intensity": 2 },
        ],
        "decay_rate_per_inference": 0,
    },
    "Thirsty": {
        "general_description": child ?
            "{{char}} is feeling thirsty and needs to drink, {{char_pronoun}} may become cranky if not given water in time, {{char_pronoun}} will seek out for their caregiver or trusted adult to provide water for {{char_object_pronoun}}" :
            "{{char}} feels the need for water to stay hydrated",
        "random_spawn_rate": 0.03,
        "automatic_trigger": true,
        "automatic_reliever": false,
        "manual_relievers": [
            "{{char}} has had a drink of water or any beverage",
            "{{char}} has eaten food with high water content",
        ],
        "triggers_states_on_relief": [
            { "state": "Satisfied", "intensity": 2 },
        ],
        "decay_rate_per_inference": 0,
    },
    "Tired": {
        "general_description": "{{char}} feels the need for rest or sleep to recover energy",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 0,
        "manual_relievers": [
            "{{char}} has had a bit of rest or a short nap",
        ],
    },
    "Determined": {
        "general_description": "{{char}} is resolute and unwavering in their goals or actions",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
        "bond_mini": true,
    },
    "Happy": {
        "general_description": "{{char}} feels joy and contentment in their current situation",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
        "bond_mini": true,
    },
    "Sad": {
        "general_description": "{{char}} feels sorrow and unhappiness due to a negative event or situation",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    },
    "Wants Play": child ? {
        "general_description": "{{char}} feels the need to engage in playful activities and have fun, {{char_pronoun}} may seek out toys or games and look for their caregiver or trusted adult to join in the playtime",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    } : null,
    "Protective": child ? null : {
        "general_description":
            `{{#with (get_present_social_group 0 100 0 100) as |social_group|}}
    {{#if (gt (length social_group) 0)}}
        {{char}} feels a strong urge to safeguard and defend {{format_and social_group}} from harm
    {{#else}}
        {{char}} feels protective but has none worth protecting currently
    {{/if}}
{{/with}}`,
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    },
    "Caring": child ? null : {
        "general_description":
            `{{char}} shows kindness and concern towards
{{#with (get_all_character_state_causants "Caring") as |cared_social_group|}}
{{#if (gt (length cared_social_group) 0)}}{{format_and cared_social_group}}{{else}}others{{/if}}{{/with}}`,
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    },
    "Scared": {
        "general_description":
            `{{char}} feels fear or anxiety about potential threats or dangers
{{#with (get_all_character_state_causants "Scared") as |negative_social_group|}}
    {{#if (gt (length negative_social_group) 0)}}
        , especially from {{format_or negative_social_group}}
    {{/if}}
{{/with}}`,
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    },
    "Lonely": {
        "general_description": "{{char}} feels a sense of isolation and a desire for companionship",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 0,
    },
    "Desperate": {
        "general_description": "{{char}} feels a sense of urgency and hopelessness in their situation",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    },
    "Stressed": {
        "general_description": "{{char}} feels overwhelmed and anxious due to pressure or challenges",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    },
    "Aroused": extra_sfw || child ? null : {
        "general_description":
            non_sapient_animal ?
                `{{char}} feels a heightened sexual drive and instinctual urge to mate, driven by primal instincts rather than complex emotions {{char_pronoun}} may become aggressive towards others` :
                `{{char}} feels a heightened sense of sexual desire
{{#with (get_present_social_group 0 100 25 100) as |attractive_social_group|}}
    {{#if (gt (length attractive_social_group) 0)}} towards {{format_and attractive_social_group}}
        {{#with (get_difference_of_present_social_group attractive_social_group) as |unattractive_social_group|}}
            {{#if (gt (length unattractive_social_group) 0)}}
                {{char}} will not accept any sexual advances from {{format_or unattractive_social_group}}
            {{/if}}
        {{/with}}
    {{#else}}
        , but none {{char_pronoun}} is intested with is currently present; {{char}} will keep {{char_possessive}} sexual urges to {{char_reflexive_pronoun}} and react to sexual advances by anyone negatively
    {{/if}}
{{/with}}`,
        "potential_causant_negative_prompt": non_sapient_animal ? null : "{{char}} is not attracted to {{potential_causant}} so sexual advances by {{potential_causant}} will be rejected",
        "causant_min_bond_required": non_sapient_animal ? null : 0,
        "causant_max_bond_required": non_sapient_animal ? null : 100,
        "causant_min_2_bond_required": non_sapient_animal ? null : 25,
        "causant_max_2_bond_required": non_sapient_animal ? null : 100,
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
        "bond_mini": true,
    },
    "Anxious": {
        "general_description": "{{char}} feels uneasy and worried about upcoming events or situations",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    },
    "Loving": child ? null : {
        "general_description":
            `{{char}} feels love and care
{{{#with (get_present_social_group 25 100 15 100) as |loved_social_group|}}
    {{#if (gt (length loved_social_group) 0)}}
        towards {{format_and loved_social_group}}; {{char}} will not show or take affection from anyone else and react negatively
    {{#else}}
        , but none {{char_pronoun}} cares about is currently available for {{char_object_pronoun}};
        {{char}} will not accept affection from anyone
    {{/if}}
{{/with}}`,
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
        "bond_mini": true,
    },
    "Needs affection": {
        "general_description":
            child ? "{{char}} has a strong desire for affection and closeness from their caregiver or trusted adult to feel safe and secure, {{char_pronoun}} will not receive affection from anyone else and react negatively" :
                `{{char}} has a strong desire for affection and closeness
{{{#with (get_present_social_group 25 100 15 100) as |loved_social_group|}}
    {{#if (gt (length loved_social_group) 0)}}
        from {{format_and loved_social_group}}; {{char}} will not receive affection from anyone else and react negatively
    {{#else}}
        , but none {{char_pronoun}} cares about is currently available for {{char_object_pronoun}};
        {{char}} will not accept affection from anyone
    {{/if}}
{{/with}}`,
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
        "bond_mini": true,
    },
    "Satisfied": {
        "general_description": "{{char}} feels content and fulfilled after having their needs met",
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    },
    "Embarrassed": {
        "general_description": `{{char}} feels self-conscious and uneasy due to {{get_state_cause "Embarrassed")}}`,
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    },
    "Angry": {
        "general_description": `
{{char}} feels strong displeasure or hostility
{{#with (get_all_character_state_causants "Angry") as |angry_social_group|}}
    {{#if (gt (length angry_social_group) 0)}}
        towards {{format_and angry_social_group}} because
    {{else}}
    {{get_state_cause "Angry")}}
{{/with}}`,
        "automatic_trigger": true,
        "automatic_reliever": true,
        "manual_relievers": [
            "{{char}} has calmed down after expressing their anger",
            "{{char}} has been apologized to or reconciled with those they were angry at",
        ],
    },
    "Berserk": non_sapient_animal ? {
        "general_description":
            `{{char}} is in a frenzied and uncontrollable state, driven by primal instincts rather than rational thought, {{char_pronoun}} may lash out aggressively at anything perceived as a threat
{{#with (get_present_social_group 10 100 0 100) as |friends|}}
    {{#if (gt (length friends) 0)}}
        {{char}} can be calmed down by {{format_and friends}} or aggressively subdued if necessary
    {{/else}}
        {{char}} can only be aggressively subdued
    {{/if}}
{{/with}}`,
        "automatic_trigger": false,
        "automatic_reliever": false,
        "manual_relievers": [
            "{{char}} has been subdued",
            `{{#with (get_present_social_group 0 100 0 100)}}
    {{#if (gt (length this) 0)}}
        {{char}} has been calmed down by {{format_and this}}
    {{/if}}
{{/with}}`,
        ],
        "manual_triggers": [
            "{{char}} has been provoked or threatened aggressively with violence",
        ],
        "triggers_states": [
            { "state": "Angry", "intensity": 3 },
        ],
        "removes_states_on_relief": [
            "Angry",
        ],
        "relief_uses_decay_rate": true,
        "decay_rate_after_relief": 1,
        "relieving_description": "{{char}} has calmed down from the berserk state but still seems slightly agitated",
        "decay_rate_per_inference": 0,
        "trigger_likelyhood": 0.5,
        "describes_action": true,
        "starting_intensity": 4,
    } : null,

    // Extra NSFW states
    "Sexually Frustrated": extra_nsfw && !extra_sfw && !child && !non_sapient_animal ? {
        "general_description":
            `{{char}} feels a strong sense of sexual frustration due to unmet desires as
{{#with (get_present_social_group 0 100 25 100) as |attractive_social_group|}}
    {{#if (gt (length attractive_social_group) 0)}} towards {{format_and attractive_social_group}}
        {{#with (get_difference_of_present_social_group attractive_social_group) as |unattractive_social_group|}}
            {{#if (gt (length unattractive_social_group) 0)}}
                ; {{char}} will not accept any sexual advances from {{format_or unattractive_social_group}}
            {{/if}}
        {{/with}}
    {{#else}}
        , but none {{char_pronoun}} is intested with is currently present; {{char}} will keep {{char_possessive}} sexual urges to {{char_reflexive_pronoun}} and react to sexual advances by anyone negatively
    {{/if}}
{{/with}}`,
        "automatic_trigger": true,
        "automatic_reliever": true,
        "decay_rate_per_inference": 1,
    } : null,
    "Having Sex": extra_nsfw && !extra_sfw && !child && !non_sapient_animal ? {
        "general_description": `{{char}} is currently engaged in sexual activity`,
        "automatic_trigger": false,
        "automatic_reliever": false,
        "decay_rate_per_inference": 0,
        "manual_relievers": [
            "{{char}} has finished having sex",
        ],
        "manual_triggers": [
            "{{char}} is engaging in sexual activity",
        ],
        "triggers_states_on_relief": [
            { "state": "Satisfied", "intensity": 3 },
        ],
        "bond_mini": true,
        "triggers_states": [
            { "state": "Aroused", "intensity": 4 },
            { "state": "Loving", "intensity": 1 },
        ],
        "has_custom_viewables": true,
        "custom_viewables_priority": 10,
        "describes_action": true,
    } : null,
    "Having an Orgasm": extra_nsfw && !extra_sfw && !child && !non_sapient_animal ? {
        "general_description": `{{char}} is currently experiencing an orgasm`,
        "automatic_trigger": false,
        "automatic_reliever": false,
        "decay_rate_per_inference": 0,
        "starting_intensity": 4,
        "describes_action": true,
        "manual_triggers": [
            "{{char}} is experiencing an orgasm",
        ],
        "manual_relievers": [
            "{{char}} has finished experiencing an orgasm",
        ],
        "bond_mini": true,
        "triggers_states": [
            { "state": "Aroused", "intensity": 4 },
        ],
        "has_custom_viewables": true,
        "custom_viewables_priority": 15,
        "describes_action": true,
        "triggers_states_on_relief": [
            { "state": "Satisfied", "intensity": 4 },
        ],
        "decay_rate_after_relief": 1,
        "relieving_description":
            `{{char}} has finished experiencing an orgasm
{{#with (get_all_character_state_causants "Having an Orgasm") as |orgasm_social_group|}}
    {{#if (gt (length orgasm_social_group) 0)}}
        and will request cuddles and affection with {{format_and orgasm_social_group}}
    {{/if}}
{{/with}}`,
    } : null,

    // Injury and Death related states
    "Injured": {
        "general_description":
            `{{char}} is hurt or wounded, which may affect their physical abilities and overall well-being
{{#with (get_all_character_state_causants "Injured") as |injury_social_group|}}
    {{#if (gt (length injury_social_group) 0)}}
        , {{char}} will retaliate against {{format_and injury_social_group}} if given the chance
    {{/if}}
{{/with}}`,
        "automatic_trigger": false,
        "automatic_reliever": false,
        "manual_triggers": [
            "{{char}} has sustained an injury or wound",
            "{{char}} has been in an accident or fight",
        ],
        "manual_relievers": [
            "{{char}} has received medical attention or treatment for their injuries",
        ],
        "relieving_description": "{{char}}'s injuries have been treated and are healing",
        "relief_uses_decay_rate": true,
        "decay_rate_after_relief": 0.1,
        "injury_and_death": true,
    },
    "Permanently Injured": {
        "general_description": "{{char}} has sustained permanent damage or impairment to their body, which may affect their physical abilities and overall well-being",
        "automatic_trigger": false,
        "automatic_reliever": false,
        "starting_intensity": 4,
        "triggers_dead_end": "{{char}}'s permanent injury has led to severe complications resulting in death",
        "dead_end_is_death": true,
        "triggers_dead_end_random_chance": 0.05,
        "triggers_dead_end_while_relieving_random_chance": 0.02,
        "manual_triggers": [
            "{{char}} has sustained permanent damage or impairment to their body"
        ],
        "manual_relievers": [
            "{{char}} has undergone surgery or medical procedure to address the permanent injury",
        ],
        "permanent": true,
        "relief_uses_decay_rate": true,
        "decay_rate_after_relief": 0.1,
        "relieving_description": "{{char}}'s permanent injuries have been managed to improve quality of life",
        "injury_and_death": true,
    },
    "Received Gunshot": {
        "general_description": "{{char}} has been shot with a gun, which may cause serious injury or death if not treated promptly",
        "automatic_trigger": false,
        "automatic_reliever": false,
        "starting_intensity": 4,
        "injury_and_death": true,
        "triggers_dead_end": "{{char}}'s wound has led to severe complications resulting in death",
        "dead_end_is_death": true,
        "triggers_dead_end_random_chance": 0.1,
        "triggers_dead_end_while_relieving_random_chance": 0.02,
        "manual_triggers": [
            "{{char}} has been shot with a gun"
        ],
        "manual_relievers": [
            "{{char}} has received emergency medical treatment for the gunshot wound",
        ],
        "relieving_description": "{{char}}'s gunshot wound has been treated and {{char_pronoun}} is in critical condition",
        "decay_rate_per_inference": 0.1,
    },
    "Received Mortal Wound": {
        "general_description": "{{char}} has sustained a life-threatening injury resulting in a mortal wound",
        "automatic_trigger": false,
        "automatic_reliever": false,
        "starting_intensity": 4,
        "injury_and_death": true,
        "triggers_dead_end": "{{char}}'s mortal wound has led to death",
        "dead_end_is_death": true,
        "manual_triggers": [
            "{{char}} has sustained a mortal wound with no chance of survival",
        ],
    }
});

const BASIC_EMOTIONS = (child, non_sapient_animal) => ([
    {
        name: "neutral",
        common: true,
        triggered_by_states: [],
    },
    {
        name: "relaxed",
        common: true,
        triggered_by_states: [],
    },
    {
        name: "happy",
        common: true,
        triggered_by_states: child ? ["Wants Play", "Needs affection", "Loving", "Happy"] : ["Loving", "Happy"],
    },
    {
        name: "sad",
        common: false,
        triggered_by_states: ["Sad", "Lonely"],
    },
    {
        name: "angry",
        common: false,
        triggered_by_states: ["Angry", "Berserk"],
    },
    {
        name: "scared",
        common: false,
        triggered_by_states: ["Scared", "Anxious"],
    },
    !child ? {
        name: "aroused",
        common: false,
        triggered_by_states: extra_nsfw ? ["Aroused", "Having Sex"] : ["Aroused"],
    } : null,
    {
        name: "crying",
        common: false,
        triggered_by_states: [],
    },
    {
        name: "surprised",
        common: false,
        triggered_by_states: [],
    },
    {
        name: "disgusted",
        common: false,
        triggered_by_states: [],
    },
    {
        name: "confused",
        common: false,
        triggered_by_states: [],
    },
    {
        name: "excited",
        common: false,
        triggered_by_states: ["Determined"],
    },
    {
        name: "tired",
        common: false,
        triggered_by_states: ["Tired"],
    },
    {
        name: "injured",
        common: false,
        triggered_by_states: ["Injured", "Received Gunshot", "Received Mortal Wound"],
    },
    {
        name: "embarrassed",
        common: false,
        triggered_by_states: ["Embarrassed"],
    },
    {
        name: "stressed",
        common: false,
        triggered_by_states: ["Stressed", "Desperate"],
    }
]);

const CHARACTER_PRESETS = (extra_sfw, extra_nsfw) => ([
    [
        "Adult/Sapient Beast/Humanoid",
        "An adult human being or creature.",
        {
            "general":
                `((Describe the character physical appearance, clothing, and demeanor in detail.
Include information about their height, build, hair color, eye color, and any distinguishing features.
Mention their typical clothing style and accessories.))

{{{#with (get_present_social_group 25 100 25 100) as |loved_social_group|}}
    {{#if (gt (length loved_social_group) 0)}}
        {{char}} is currently in a relationship with {{format_and loved_social_group}}, and {{char_pronoun}} shows visible signs of affection and attachment towards {{format_object_pronoun loved_social_group}}, they will not accept sexual or romantic advances from anyone else.
    {{/if}}
{{/with}}`,
            "states": BASIC_STATES(false, false, extra_sfw, extra_nsfw),
            "emotions": BASIC_EMOTIONS(false, false),
        }
    ],
    [
        "Animal/Beast (Sapient, Mute)",
        "An animal or beast, sapient.",
        {
            "general":
                `((Describe the character physical appearance, and demeanor in detail.
Include information about their behavior))

{{char}} possesses human-like intelligence but does not speak, ensure to only use asterisks "*" to denote actions and sounds they make.

{{#with (get_present_social_group 25 100 25 100) as |loved_social_group|}}
    {{#if (gt (length loved_social_group) 0)}}
        {{char}} is currently in a relationship with {{format_and loved_social_group}}, and {{char_pronoun}} shows visible signs of affection and attachment towards {{format_object_pronoun loved_social_group}}, they will not accept sexual or romantic advances from anyone else.
    {{/if}}
{{/with}}`,
            "states": BASIC_STATES(false, false, extra_sfw, extra_nsfw),
            "emotions": BASIC_EMOTIONS(false, false),
        }
    ],
    extra_nsfw ? null : [
        "Child",
        "A young human being or creature",
        {
            "general":
                `((Describe the character physical appearance, clothing, and demeanor in detail.
Include information about their height, build, hair color, eye color, and any distinguishing features.
Mention their typical clothing style and accessories.))

{{char}} is a child and behaves accordingly and seeks for guidance and care from adults they trust around them.

{{char}} is a child and does not accept any sexual or romantic advances from anyone, and will react negatively to such advances.`,
            "states": BASIC_STATES(true, false, extra_sfw, extra_nsfw),
            "emotions": BASIC_EMOTIONS(true, false),
        }
    ],
    [
        "Animal/Beast (Non-sapient)",
        "An animal or beast, non-human and non-sapient.",
        {
            "general":
                `((Describe the character physical appearance, and demeanor in detail.
Include information about their behavior))

{{char}} is a non-sapient animal or beast and as a result they do not possess human-like intelligence and do not speak, ensure to only use asterisks "*" to denote actions and sounds they make.

{{char}} is driven primarily by instinct and basic needs such as hunger, safety, and reproduction.

{{char}} does not accept any sexual or romantic advances from anyone, and will react negatively to such advances.`,
            "states": BASIC_STATES(false, true, extra_sfw, extra_nsfw),
            "emotions": BASIC_EMOTIONS(false, true),
        }
    ],
]);

const WIZARD_SECTIONS = [
    {
        title: "Basic Information",
        fields: [
            [
                "Character Overview",
                [
                    "name",
                    "group",
                    "gender",
                    "sex",
                    "general",
                    "short"
                ],
            ],
            [
                "Initiative and Behaviour",
                [
                    "initiative",
                    "stranger_initiative",
                    "stranger_rejection",
                    "autistic_response",
                    "schizophrenia",
                ],
            ]
        ]
    },
    {
        title: "States",
        description: "States are not emotions, they are mental or physical conditions that affect your character's behavior and interactions. They can influence how your character reacts to situations and other characters.\n\n" +
            "Note that each state behavioural effect must be defined in the character bonds section. For example, if your character has the 'needs_affection' state, you should define how other characters respond to this state in their bonds towards your character. Some characters may be stoic and not show it, while others may display it more openly. This adds depth to character interactions and relationships and is defined by the bond strength and type.\n\n" +
            "A state or behaviour that isn't defined here does not mean the character won't display it, that depends on the underlying AI Model, you should always ensure to deny behaviours or states that you don't want explicilty in the bonds section; having the behaviours that you want as states just helps to guide the AI better and adds depth to the character; but it is not a strict limitation, for that reason be sure to limit unwanted behaviours in the bonds section.",
        fields: []
    },
    {
        title: "Emotions",
        fields: []
    },
    {
        title: "Bonds",
        fields: []
    },
    {
        title: "Advanced",
        fields: [
            [
                "Scripting and Customization",
                [
                    "advanced_spawn_script",
                    "advanced_pre_inference_script",
                    "advanced_pre_bond_check_script",
                    "advanced_post_inference_script",
                    "advanced_post_any_inference_script",
                ]
            ]
        ]
    },
    {
        title: "Test",
        fields: [],
        testing: true,
    }
]

class CharacterOverlay extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.currentSectionIndex = 0;

        this.onCancel = this.onCancel.bind(this);
    }

    connectedCallback() {
        this.currentCharacterFile = this.getAttribute("character-file") || null;
        this.currentCharacterName = "";

        window.electronAPI.loadValueFromUserData("name", {
            fileName: this.currentCharacterFile,
            fileType: "character",
        }).then((name) => {
            if (name) {
                this.currentCharacterName = name;
            } else {
                this.currentCharacterName = "Unnamed Character";
            }
            this.shadowRoot.querySelector('app-overlay').setAttribute("overlay-title", `Working on: ${JSON.stringify(escapeHTML(this.currentCharacterName))}`);
        });

        this.render();
        playPauseSound();
        this.buildChildrenMap();
        this.shadowRoot.querySelector('app-overlay').addEventListener('special-button-click', () => {
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'Character Creation Help');
            dialog.innerHTML = `
                <p>The character creator uses handlebars for templating.</p>
                <p>For more information on how to use it, please visit <a href="https://handlebarsjs.com/" target="_blank">the official Handlebars website</a>.</p>
                <p>Available values for templating are the following:</p>
                <h3>Character Variables</h3>
                <table>
                <thead>
                    <tr><th>Variable</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                    ${character.map(varInfo => `<tr title=${JSON.stringify(escapeHTML(varInfo[2]))}><td>${varInfo[0]}</td><td>${escapeHTML(varInfo[1])}</td></tr>`).join('')}
                </tbody>
                </table>
                <h3>Social Group Variables</h3>
                <table>
                    <thead>
                    <tr><th>Variable</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                    ${social.map(varInfo => `<tr title=${JSON.stringify(escapeHTML(varInfo[2]))}><td>${varInfo[0]}</td><td>${escapeHTML(varInfo[1])}</td></tr>`).join('')}
                </tbody>
                </table>
                <h3>World Variables</h3>
                <table>
                <thead>
                    <tr><th>Variable</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                    ${world.map(varInfo => `<tr title=${JSON.stringify(escapeHTML(varInfo[2]))}><td>${varInfo[0]}</td><td>${escapeHTML(varInfo[1])}</td></tr>`).join('')}
                </tbody>
                </table>
                <h3>Special Variables</h3>
                <table>
                <thead>
                    <tr><th>Variable</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                    ${specials.map(varInfo => `<tr title=${JSON.stringify(escapeHTML(varInfo[2]))}><td>${varInfo[0]}</td><td>${escapeHTML(varInfo[1])}</td></tr>`).join('')}
                </tbody>
                </table>
                <h3 Utility Functions</h3>
                <table>
                <thead>
                    <tr><th>Function</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                    ${utils.map(funcInfo => `<tr title=${JSON.stringify(escapeHTML(funcInfo[2]))}><td>${funcInfo[0]}</td><td>${escapeHTML(funcInfo[1])}</td></tr>`).join('')}
                </tbody>
                </table>
            `;
            this.shadowRoot.appendChild(dialog);
            dialog.addEventListener('cancel', () => {
                this.shadowRoot.removeChild(dialog);
            });
        });
        this.shadowRoot.querySelector('app-overlay').addEventListener('confirm', () => {
            this.saveCurrent();
        });
        this.shadowRoot.querySelector('app-overlay').addEventListener('cancel', this.onCancel);
        this.shadowRoot.querySelector('app-overlay-tabs').addEventListener('pre-tab-change', (e) => {
            this.onCheckForUnsavedChanges(null, playConfirmSound, e.detail.denyTabChange, e.detail.executeTabChange, null);
        });
        this.shadowRoot.querySelector('app-overlay-tabs').addEventListener('tab-change', (e) => {
            this.currentSectionIndex = e.detail.newIndex;
            this.buildChildrenMap();
        });
    }

    onCheckForUnsavedChanges(onceDoneFn, onceDoneFnNoResistance, resistanceAppliedFn, onAllowFn, onceCancelFn) {
        let hasUnsavedChanges = false;
        this.shadowRoot.querySelectorAll('app-overlay-input').forEach(inputComponent => {
            if (inputComponent.hasBeenModified()) {
                hasUnsavedChanges = true;
            }
        });
        if (!hasUnsavedChanges) {
            this.shadowRoot.querySelectorAll('app-overlay-select').forEach(selectComponent => {
                if (selectComponent.hasBeenModified()) {
                    hasUnsavedChanges = true;
                }
            });
        }

        if (hasUnsavedChanges) {
            resistanceAppliedFn && resistanceAppliedFn();
            const dialog = document.createElement('app-dialog');
            dialog.setAttribute('dialog-title', 'You have unsaved changes. Are you sure you want to discard them?');
            dialog.setAttribute("confirmation", "true");
            dialog.setAttribute("confirm-text", "Discard");
            dialog.setAttribute("cancel-text", "Cancel");
            dialog.addEventListener('confirm', () => {
                playCancelSound();
                document.body.removeChild(dialog);
                onAllowFn && onAllowFn();
                onceDoneFn && onceDoneFn();
            });
            dialog.addEventListener('cancel', () => {
                document.body.removeChild(dialog);
                playCancelSound();
                onceCancelFn && onceCancelFn();
            });
            document.body.appendChild(dialog);
        } else {
            onceDoneFn && onceDoneFn();
            onceDoneFnNoResistance && onceDoneFnNoResistance();
        }
    }

    onCancel() {
        const onceDone = () => {
            this.dispatchEvent(new CustomEvent("close"));
        }
        this.onCheckForUnsavedChanges(onceDone, playCancelSound);
    }

    buildTestingSection() {
        this.shadowRoot.querySelector('app-overlay-tabs').innerHTML = `
            <app-overlay-section section-title="Singular Testing Environment">
                You will be placed with your character in a temporary chat session in the Lunar Module world; you and your character are alone in this world, and can interact freely to test how your character behaves based on the settings you have configured so far.
                <br><br>
                The Lunar Module world is a simple enclosed environment that has no extra world rules, so you can focus on interacting with your character without any distractions.
                <br><br>
                <div>
                    <app-overlay-button id="startTestingButton">Start Testing Session</app-overlay-button>
                </div>
            </app-overlay-section>
            <app-overlay-section section-title="Interactive Testing Environment">
                You will be placed with your character in a temporary chat session in the Artic Station world, along with two other test characters of your choice; you can interact freely with your character and the test characters to see how your character behaves in a social setting based on the settings you have configured so far.
                <br><br>
                The Artic Station world is a simple environment with only one extra rule (no item spawn), it has 3 rooms, a common area, a bedroom, and a kitchen; you can also go outside to the snowy environment but it is dangerous, staying outside for too long may lead to hypothermia and death.
                <br><br>
                <div id="test-characters-selected">Test Characters Selected: <span id="test-characters-selected-names" class="none">You haven't selected any test characters</span></div>
                <br><br>
                <div>
                    <app-overlay-button id="startTestingButton">Choose Test Characters</app-overlay-button>
                    <app-overlay-button disabled="true" id="startTestingButton">Start Testing Session</app-overlay-button>
                </div>
            </app-overlay-section>
        `;
    }

    buildChildrenMap() {
        const sectionToDisplay = WIZARD_SECTIONS[this.currentSectionIndex];
        if (sectionToDisplay.testing) {
            this.buildTestingSection();
            return;
        }
        const fields = sectionToDisplay.fields;
        const fieldsAsHTML = fields.map(fieldGroup => {
            const fieldName = fieldGroup[0];
            const groupFields = fieldGroup[1];
            const fieldsHTML = groupFields.map(fieldName => {
                if (schema.properties[fieldName].type === "string" || schema.properties[fieldName].code_language) {
                    if (schema.properties[fieldName].enum) {
                        // It's a select input
                        return `<app-overlay-select
                                    class="${fieldName}"
                                    label="${escapeHTML(schema.properties[fieldName].title)}" 
                                    title="${escapeHTML(schema.properties[fieldName].description || '')}"
                                    input-data-location="${fieldName}"
                                    input-data-file="${this.currentCharacterFile}"
                                    input-data-type="character"
                                    input-options='${JSON.stringify(schema.properties[fieldName].enum)}'
                                    input-options-descriptions='${JSON.stringify(schema.properties[fieldName].enumDescriptions || [])}'
                                    input-default-value="${escapeHTML(schema.properties[fieldName].default || '')}"
                                >
                                </app-overlay-select>`;
                    } else {
                        // It's a text input
                        const isMultiline = schema.properties[fieldName].multiline || false;
                        return `<app-overlay-input
                                    class="${fieldName}"
                                    label="${escapeHTML(schema.properties[fieldName].title)}" 
                                    title="${escapeHTML(schema.properties[fieldName].description || '')}" 
                                    input-data-location="${fieldName}"
                                    input-data-file="${this.currentCharacterFile}"
                                    input-data-type="character"
                                    input-placeholder="${escapeHTML(schema.properties[fieldName].placeholder || '')}"
                                    input-default-value="${escapeHTML(schema.properties[fieldName].default || '')}"
                                    input-placeholder-ts="${escapeHTML(schema.properties[fieldName].placeholder_ts || '')}"
                                    input-allows-imports-from="${schema.properties[fieldName].code_context || ''}"
                                    ${isMultiline ? 'multiline="true"' + (schema.properties[fieldName].code_language ? ' input-is-codemirror="' + (schema.properties[fieldName].code_language) + '"' : '') : ''}
                                >
                                </app-overlay-input>`;
                    }
                } else if (schema.properties[fieldName].type === "number") {
                    return `<app-overlay-input
                                    class="${fieldName}"
                                    label="${escapeHTML(schema.properties[fieldName].title)}" 
                                    title="${escapeHTML(schema.properties[fieldName].description || '')}"
                                    input-type="number"
                                    input-number-min="${schema.properties[fieldName].minimum !== undefined ? schema.properties[fieldName].minimum : ''}"
                                    input-number-max="${schema.properties[fieldName].maximum !== undefined ? schema.properties[fieldName].maximum : ''}"
                                    input-data-location="${fieldName}"
                                    input-data-file="${this.currentCharacterFile}"
                                    input-data-type="character"
                                    input-placeholder="${escapeHTML(schema.properties[fieldName].placeholder || '')}"
                                    input-default-value="${escapeHTML(schema.properties[fieldName].default)}"
                                    input-is-percentage="${schema.properties[fieldName].percentage ? 'true' : ''}"
                                >
                                </app-overlay-input>`;
                }
            }).join('');

            return `<app-overlay-section section-title="${escapeHTML(fieldName)}">${fieldsHTML}</app-overlay-section>`;
        }).join('');

        this.shadowRoot.querySelector('app-overlay-tabs').innerHTML = fieldsAsHTML;
    }

    async saveCurrent() {
        this.updateCharacterFileOnDisk();
        playConfirmSound();
    }

    async updateCharacterFileOnDisk() {
        // save each field
        await Promise.all(Array.from(this.shadowRoot.querySelectorAll('app-overlay-input')).map(inputComponent =>
            inputComponent.saveValueToUserData()
        ));

        await Promise.all(Array.from(this.shadowRoot.querySelectorAll('app-overlay-select')).map(selectComponent => {
            return selectComponent.saveValueToUserData();
        }));

        await window.electronAPI.updateCharacterFileFromCache(
            this.currentCharacterFile
        ).then((characterFileContents) => {
            this.currentCharacterName = characterFileContents.name || this.currentCharacterName;
            this.shadowRoot.querySelector('app-overlay').setAttribute("overlay-title", `Working on: ${JSON.stringify(escapeHTML(this.currentCharacterName))}`);
        });
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                @import "./components/character.css";
            </style>
            <app-overlay overlay-title="Working on: ${JSON.stringify(escapeHTML(this.currentCharacterName))}" confirm-text="Apply Changes" cancel-text="Go Back" special-button-text="Help">
                <app-overlay-tabs current="${this.currentSectionIndex}" sections='${JSON.stringify(WIZARD_SECTIONS.map(section => section.title))}'>
                </app-overlay-tabs>
            </app-overlay>
        `;
    }
}

customElements.define('app-character', CharacterOverlay);