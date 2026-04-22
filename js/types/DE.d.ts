declare type PromiseOrNot<T> = T | Promise<T>;

declare interface DEMinimalCharacterReference {
    /**
     * Name of the character
     */
    name: Readonly<string>;
    /**
     * Biological sex of the character
     */
    sex: "male" | "female" | "intersex" | "none";
    /**
     * Gender identity of the character
     */
    gender: "male" | "female" | "ambiguous";
    /**
     * Height in centimeters
     */
    heightCm: number;
    /**
     * Weight in kilograms
     */
    weightKg: number;
    /**
     * Age in years
     */
    ageYears: number;
    /**
     * Maximum carrying capacity in liters
     */
    carryingCapacityLiters: number;
    /**
     * Maximum carrying capacity in kilograms
     */
    carryingCapacityKg: number;
    /**
     * Daily caloric needs in calories
     */
    maintenanceCaloriesPerDay: number;
    /**
     * Maximum range of locomotion in meters
     */
    rangeMeters: number;
    /**
     * Maximum speed of locomotion in meters per second
     */
    locomotionSpeedMetersPerSecond: number;
    /**
     * Daily hydration needs in liters
     */
    maintenanceHydrationLitersPerDay: number;
    /**
     * Short description of the character, assume they may have accessories
     * or clothes on them but it must not detail those
     */
    shortDescription: string;
    /**
     * Short description when the character is top naked, this is added
     * to the end of the shortDescription when the character is top naked
     */
    shortDescriptionTopNakedAdd: string | null;
    /**
     * Short description when the character is bottom naked, this is added
     * to the end of the shortDescription when the character is bottom naked
     */
    shortDescriptionBottomNakedAdd: string | null;

    /**
     * A number from 0 to 1 that represents how likely the character is to perform stealthy actions or behaviours
     * higher means more likely to perform stealthy actions, this is useful for characters that are sneaky or like to hide
     * 
     * Used in the following scenarios:
     * - When a character performs a robbery, the LLM checks the characters that were interacted to see if they noticed; for the rest of the characters that were not with
     * the character, the engine uses their stealth score to see if they noticed the robbery or not, higher stealth means less likely to notice
     */
    stealth: number;

    /**
     * A number from 0 to 1 that represents how likely the character is to perform perceptive actions or behaviours
     * higher means more likely to perform perceptive actions, this is useful for characters that are observant or like to pay attention to details
     * 
     * Used in the following scenarios:
     * - When a character performs a robbery, and the character is deemed as noticing (aka passes the stealth check), then the engine uses their perception score to see
     * if they actually noticed the robbery or just noticed that something happened but couldn't tell what, higher perception means more likely to actually notice the robbery and identify the robbery
     */
    perception: number;

    /**
     * A number from 0 to 1 that represents how attractive the character is, higher means more attractive and more likely to be approached by other characters and have romantic interactions, this is useful for characters that are meant to be charming or have a strong romantic appeal, it can also affect how other characters perceive them and interact with them in social situations
     */
    attractiveness: number;

    /**
     * A number from 0 to 1 that represents how charismatic the character is, higher means more charismatic and more likely to influence other characters and have strong social interactions, this is useful for characters that are meant to be leaders or have a strong social presence, it can also affect how other characters perceive them and interact with them in social situations
     */
    charisma: number;

    /**
     * A power scale string that represents the overall power level of the character
     */
    tier: "insect" | "critter" | "human" | "apex" | "street_level" | "block_level" | "city_level" | "country_level" | "continental" | "planetary" | "stellar" | "galactic" | "universal" | "multiversal" | "limitless";
    /**
     * The numeric value on the power scale compared to others in the same power scale
     * A number from 0 to 100, where 0 it means barely makes it and 100 means in peak condition
     * this is used for probabilities to compare how characters fare against each other, provided they are in the same power scale
     * if they are in a different power scale, the higher power scale wins regardless
     * 
     * A character 1 power scale below can hurt one a power level above, but they cannot really
     * properly damage them, they can only annoy them or cause minor inconveniences, but not really cause them harm; for example, a human can hurt an apex character, but they cannot really damage them, they can only annoy them or cause minor inconveniences, but not really cause them harm
     * 
     * Note this is only true while disarmed
     * 
     * TODO implement power scales in interactions
     */
    tierValue: number;
    /**
     * A 0 to 1 number that represents how fast the character can grow on their power scale, this is used to determine how much they grow after certain interactions or events, higher means faster growth
     * 0.25 is recommended for a standard human character
     * 0.5 to 1 is recommended for characters that grow fast, like shonen manga protagonists
     */
    powerGrowthRate: number;

    /**
     * Species of the character, used for social simulation to determine interactions and preferences based on species, for example, a human character may have different preferences and interactions with other human characters compared to non-human characters, this can also be used to create interesting dynamics and relationships between characters of different species
     */
    species: string;
    /**
     * Type of species of the character
     */
    speciesType: "humanoid" | "feral" | "animal";
    /**
     * The race of the character, used for social simulation to determine interactions and preferences based on race
     */
    race: string | null;
    /**
     * List of groups or social categories that this characters belongs to
     */
    groupBelonging: string[];
}

declare interface DEActionPromptInjection<TemplateType> {
    /**
     * The template to inject into the character's action reasoning
     * remember this applies every inference cycle while the state is active
     * So be careful check actionPromptInjection documentation description for more details
     * on a proper use case
     */
    action?: TemplateType;
    /**
     * An optional narrive effect for the action, suppose for example the action is
     * {{char}} begins to cry
     * 
     * The narrative effect can be
     * Describe {{char}} tantrum in detail and how the tears flow down their face
     * 
     * A narrative effect gets applied to the whole narration of the character
     * 
     * While an action, gets applied towards a single paragraph of the story (or all of them if not contenders)
     * 
     * Narrative effects should be subtle
     */
    narrativeEffect?: TemplateType;
    /**
     * A narrative action that gets applied in narration instead of in the character dialogue
     * 
     * Narrative actions should be specific and explicit, they are injected into story master
     * as if he was saying that
     * 
     * For example, if the action is {{char}} begins to cry, the narrative action can be
     * 
     * Now I will describe {{char}}'s tears flowing down their face and their body shaking as they cry
     */
    narrativeAction?: TemplateType;
    /**
     * The probability (0 to 1) that the action will be even checked for execution, if say
     * the probability is only 0.5 then the action will only be considered for execution half the time
     * this is useful to avoid the character being stuck in a loop of performing the same action
     * 
     * default is 1.0 meaning it always gets considered
     * 
     * This probability exists for the sake of ease of use, the same effect can be achieved in the template
     * by using a randomizing function like get_random_seed_from_time to only return the action sometimes
     * from the template itself as an empty string in the action results in no action being performed
     * but this is way more developer friendly
     */
    probability?: number;
    /**
     * If the template represents a dead end scenario
     * use this for the description of the dead end scenario
     * the character will get removed from the story if this
     * triggers
     */
    isDeadEndScenario: boolean;
    /**
     * Whether the dead end scenario is a death scenario
     * 
     * the action must be specified as well if this is true
     * otherwise it's not possible to give a message about death
     */
    deadEndIsDeath: boolean;
    /**
     * The primary emotion this action will cause provided
     */
    primaryEmotion: DEEmotionNames;
    /**
     * The emotional range this action will cause provided
     */
    emotionalRange: DEEmotionNames[];
    /**
     * Limit vocabulary to these specific words or grammatical tokens, ensure to double quote strings
     * that match specific words, these are used for grammar control so they should be in
     * the form of grammatical patterns eg. "specific word", [A-Z]+, etc... they will be used a pipe
     * in the grammar limit
     * 
     * Do not specify this if you do not want to limit vocabulary
     */
    vocabularyLimit?: DEVocabularyLimit;
}

declare interface DECharacterStateDefinition {
    /**
     * How dominant this state is compared to other states
     * used to determine which state takes precedence in case of conflicts
     */
    dominance: number;
    /**
     * Causes the character intimacy to multiply by this factor when the state is active
     * dominance irrelevant all active states affect it
     * Default is 1, meaning no change, a value of 0.5 would mean that intimacy is halved when the state is active, a value of 2 would mean that intimacy is doubled when the state is active
     */
    intimacyMultiplier?: number;
    /**
     * Determines towards which characters the intimacy multiplier applies, if not specified, it applies towards everyone, if set to "causants_only", it only applies towards causants of the state,
     * this is useful for states that are meant to affect intimacy towards specific characters, for example a state like FLIRTING may increase intimacy towards the causants of the flirting but not towards other characters
     */
    intimacyMultiplierDirectionality?: "everyone" | "causants_only";
    /**
     * How dominant this state is after being relieved
     */
    dominanceAfterRelief?: number;
    /**
     * By default when injecting a external description via relievingGeneralCharacterExternalDescriptionInjection or
     * generalCharacterExternalDescriptionInjection, dominance is ignored for injecting these traits
     * since they do not affect behaviour and they may stack nicely
     */
    doNotIgnoreDominanceWhenInjectingExternalDescription?: boolean;
    /**
     * By default when injecting a general character description via relievingGeneralCharacterDescriptionInjection or
     * generalCharacterDescriptionInjection, dominance is used to decide whether to inject the descriptions or not, but in some cases you may want to ignore dominance for these descriptions as they are just for flavour and do not affect behaviour, and it would be nice to have them all injected even if the state is not the most dominant one
     */
    ignoreDominanceWhenInjectedGeneralCharacterDescription?: boolean;
    /**
     * By default when injecting an action prompt injection via actionPromptInjection or relievingActionPromptInjection, dominance is used to decide whether to inject the descriptions or not, but in some cases you may want to ignore dominance for these descriptions as they are just for flavour and do not affect behaviour, and it would be nice to have them all injected even if the state is not the most dominant one
     */
    ignoreDominanceForActionPromptInjection?: boolean;
    /**
     * Ignores the dominance to inject into the reasoning of the character about the state they are currently in
     * this is useful if it is always considered, like if it's an important state
     */
    ignoreDominanceForStateInjection?: boolean;
    /**
     * Description of the state, used for reasoning about the state
     * 
     * You may want to use get_state_intensity function to describe different
     * behaviours at different intensities, it is recommended to use lists
     * of conditions for this purpose, eg. consider the state is ANGRY
     * you may want to write something like a handlebars template like this:
     * 
     * """
     * {{#if (<= (get_state_intensity "ANGRY") 2)}}
     * {{char}} is annoyed and irritated.
     * Because of this the following conditions apply:
     * 1. {{char}} will raise their voice when speaking.
     * 2. {{char}} may frown or scowl.
     * 3. {{char}} may cross their arms or tap their foot impatiently.
     * {{else if (<= (get_state_intensity "ANGRY") 3)}}
     * {{char}} is angry and frustrated.
     * Because of this the following conditions apply:
     * 1. {{char}} will speak in a harsh and curt tone.
     * 2. {{char}} may clench their fists or grit their teeth.
     * 3. {{char}} may pace around or slam objects down.
     * {{else if (<= (get_state_intensity "ANGRY") 4)}}
     * {{char}} is very angry and furious.
     * Because of this the following conditions apply:
     * 1. {{char}} will shout and yell.
     * 2. {{char}} will throw objects at those that angered {{format_object_pronoun char}}
     * 3. {{char}} may become physically aggressive.
     * {{/if}}
     * """
     */
    general: DEStringTemplateCharAndCauses;
    /**
     * Description of the state after being relieved, used for reasoning about the state
     */
    generalAfterRelief?: DEStringTemplateCharAndCauses;
    /**
     * Used for descriptions of the character general state
     * get applied at system prompt level
     */
    generalCharacterDescriptionInjection?: DEStringTemplateCharAndCauses;
    /**
     * Make sure it is one line only, as this gets injected into the short
     * description of the character that represents the external perception of the character
     */
    generalCharacterExternalDescriptionInjection?: DEStringTemplateCharAndCauses;
    /**
     * Very strong, used for instructions that the character must follow
     * make sure that it is not kept every inference cycle unless intended
     * as the character will be forced to follow it no matter what
     * you may use a randomizing function to return an empty string sometimes
     * to avoid the character being stuck in a loop of following the same instruction
     * or you may choose to give different instructions each time
     * 
     * Setting the action prompt injection will disable reasoning in the character about
     * what they will do next as they will be forced to follow the instructions
     * 
     * If two injections are set at the same time by different states, the one from the state with higher dominance will take precedence,
     * if they have the same dominance, one will be chosen at random
     * 
     * Example use case:
     * say the state is NEEDS_TO_URINATE, you may want to set an action prompt injection like:
     * 
     * """
     * {{#if (== (get_state_intensity "NEEDS_TO_URINATE") 4)}}
     * {{#if (== (get_random_seed_from_time 3) 0)}}
     * {{char}} suddenly pees themselves right now, they cannot hold it anymore!
     * {{/if}}
     * {{/if}}
     * """
     * 
     * This basically means that they have a 1 in 3 chance of peeing themselves when
     * they are at maximum intensity of the NEEDS_TO_URINATE state, this will override
     * any reasoning the LLM may otherwise do about what to do next
     * 
     * The injection can have intensity levels as well to allow for different instructions
     * allowing it to be more dynamic
     */
    actionPromptInjection: DEActionPromptInjection<DEStringTemplateCharAndCauses>[];
    /**
     * Description of the state, used for reasoning about the state
     */
    relieving?: DEStringTemplateCharAndCauses;
    /**
     * Used for descriptions of the character general state
     * get applied at system prompt level when relieving the state
     */
    relievingGeneralCharacterDescriptionInjection?: DEStringTemplateCharAndCauses;
    /**
     * Make sure it is one line only, as this gets injected into the short
     * description of the character that represents the external perception of the character when relieving the state
     */
    relievingGeneralCharacterExternalDescriptionInjection?: DEStringTemplateCharAndCauses;
    /**
     * Very strong, used for instructions that the character must follow
     * make sure that it is not kept every inference cycle unless intended
     * as the character will be forced to follow it no matter what
     * you may use a randomizing function to return an empty string sometimes
     * to avoid the character being stuck in a loop of following the same instruction
     * or you may choose to give different instructions each time
     * 
     * Setting the action prompt injection will disable reasoning in the character about
     * what they will do next as they will be forced to follow the instructions
     * 
     * If two injections are set at the same time by different states, the one from the state with higher dominance will take precedence,
     * if they have the same dominance, one will be chosen at random
     * 
     * Check the actionPromptInjection description for an example use case
     */
    relievingActionPromptInjection?: DEActionPromptInjection<DEStringTemplateCharAndCauses>[];
    /**
     * Whether this state triggers a dead end that causes the character to be permanently removed from the story
     * use this for the description of the dead end scenario
     */
    triggersDeadEnd?: DEStringTemplateCharAndCauses;
    /**
     * Whether the dead end scenario is a death scenario
     */
    deadEndIsDeath?: boolean;
    /**
     * Whether the dead end triggers after a certain time being in the state
     * meaning that the character has a time limit to relieve the state
     * 
     * TODO unimplemented
     */
    deadEndByTimeInMinutes?: number;
    /**
     * A random chance (0 to 1) that the state will trigger a dead end
     * every time this state is active
     */
    triggersDeadEndRandomChance?: number;
    /**
     * A random chance (0 to 1) that the state will trigger a dead end
     * every time this state is being relieved
     */
    triggersDeadEndWhileRelievingRandomChance?: number;
    /**
     * Whether the state requires a specific posture to trigger
     * or to be active, for example, SLEEPING may require laying_down posture
     * if null, posture is not required
     */
    requiresPosture: DEPosture | null;
    /**
     * A random spawn rate (0 to 1) that the state will trigger spontaneously
     * every inference cycle
     */
    randomSpawnRate: number;
    /**
     * States that conflict with this state, if any are active, this state cannot be active
     * or even be considered for activation
     */
    conflictStates: string[];
    /**
     * States that are required for this state to be active, if any are not active, this state cannot be active
     * or even be considered for activation
     * 
     * These are applied for trigger and mantenience
     */
    requiredStates: string[];
    /**
     * States that this state triggers when it gets activated
     */
    triggersStates: { [stateName: string]: { intensity: number } };
    /**
     * States that this state relieves when it gets activated
     */
    modifiesStatesIntensitiesOnTrigger: { [stateName: string]: { intensity: number } };
    /**
     * States that this state triggers when it gets relieved and the intensity drops the first time
     * requires using a relief mechanism
     */
    triggersStatesOnRelieve?: { [stateName: string]: { intensity: number } };
    /**
     * States that this state relieves when it gets relieved and the intensity drops the first time
     * requires using a relief mechanism
     */
    modifiesStatesIntensitiesOnRelieve?: { [stateName: string]: { intensity: number } };
    /**
     * States that this state triggers when it gets relieved and the intensity drops to zero
     */
    triggersStatesOnRemove?: { [stateName: string]: { intensity: number } };
    /**
     * States that this state relieves when it gets relieved and the intensity drops to zero
     */
    modifiesStatesIntensitiesOnRemove?: { [stateName: string]: { intensity: number } };

    /**
     * Whether the state requires causants to trigger or mantain activation, once all causants are removed
     * the state also gets removed
     */
    requiresCausants?: boolean;
    /**
     * Whether the state requires character causants to trigger or mantain activation, once all character causants
     * are removed the state also gets removed
     */
    requiresCharacterCausants?: boolean;
    /**
     * Whether the state requires object causants to trigger or mantain activation, once all object causants are removed
     * the state also gets removed
     */
    requiresObjectCausants?: boolean;
    /**
     * Whether the state requires causes to trigger or mantain activation, once all causes are removed the state also gets removed
     */
    requiresCauses?: boolean;

    /**
     * If not given everyone around the character is a potential causant
     */
    potentialCausantsCriteria?: {
        /**
         * An instruction that gets added to the character description where a potential causant that does not fit
         * the criteria is set, for example, say the state is HUGGING, but the character has a low bond level, the
         * negative description could be "{{char}} would feel uncomfortable hugging {{other}}" this would
         * get injected into the system prompt, and reasoning step to help the character reason their behaviour
         * 
         * TODO this hasn't been implemented in getsysprompt
         */
        negativeDescription?: DEStringTemplateCharAndOther;
        /**
         * An instruction that gets added to the character description where a potential causant that fits
         * the criteria is set, for example, say the state is HUGGING, and the character has a high bond level, the
         * positive description could be "{{char}} would feel happy hugging {{other}}" this would
         * get injected into the system prompt, and reasoning step to help the character reason their behaviour
         * 
         * TODO this hasn't been implemented in getsysprompt
         */
        positiveDescription?: DEStringTemplateCharAndOther;
        /**
         * Minimum bond level required for a potential character causant to be considered
         */
        minBondRequired?: number;
        /**
         * Maximum bond level allowed for a potential causant to be considered valid to activate this state
         */
        maxBondAllowed?: number;
        /**
         * Minimum 2-bond level required for a potential causant to be considered valid to activate this state
         */
        min2BondRequired?: number;
        /**
         * Maximum 2-bond level allowed for a potential causant to be considered valid to activate this state
         */
        max2BondAllowed?: number;
        /**
         * Whether a potential causant that is a completely total stranger (no bond) is allowed to be a causant of this state
         */
        noBondAllowed?: boolean;
        /**
         * Whether a potential causant that is not a stranger (has some bond) is denied to be a causant of this state
         */
        bondDenied?: boolean;
        /**
         * Whether to only allow family members as causants of this state, if no characters are around, no questions are asked about triggering the state if requiresCausant is true
         */
        onlyFamily?: boolean;
        /**
         * To deny familie who have a relationship of this type
         */
        familyExclude?: DEFamilyRelation[];
        /**
         * Custom potential causant determiner
         * 
         * @param character 
         * @param potentialCausant 
         * @returns 
         */
        custom?: (character: DEMinimalCharacterReference, potentialCausant: DEMinimalCharacterReference) => boolean;
    },

    /**
     * The intensity change rate per inference cycle when the state is active
     * should be a float bewteen -4 and 4
     */
    intensityChangeRatePerInferenceCycle: number;

    /**
     * The intensity change rate per minute when the state is active
     * should be a float bewteen -4 and 4
     */
    intensityChangePerMinute?: number;

    /**
     * INTENSITY_EXPRESSIVE:
     * For example the state SCARED may be intensity expressive, it will cause the injection on the character state of:
     * - scared, very Scared, extremely Scared, overwhelmingly Scared.
     * Depending on intensity level from 1 to 4
     * 
     * ## Susan States:
     * - Very Scared
     * 
     * BINARY:
     * Either an on/off state, for example SLEEPING
     * 
     * ## Susan States:
     * - Sleeping.
     * 
     * HIDDEN:
     * Hidden states do not get described in the character description, they are useful for states that are only used to determine
     * actions, for example TALKING_ABOUT_THEIR_FRIEND_BOB which triggers when the character is being asked about Bob and that
     * injects a specific prompt (or actions) about this context, and the state relieves when the character is no longer talking about Bob
     * 
     * ## Susan States:
     * - (nothing really gets added)
     */
    behaviourType: "INTENSITY_EXPRESSIVE" | "BINARY" | "HIDDEN";
    /**
     * Whether the releif uses a decay rate that reduces intensity over time
     * this is only regarding states that have relief mechanisms
     */
    usesReliefDynamic?: boolean;
    /**
     * The intensity change rate applied to the relief mechanism if usesReliefDynamic is true
     */
    intensityChangeRatePerInferenceCycleAfterRelief?: number;
    /**
     * A permanent state never goes away and only get to 1 intensity level
     */
    permanent: boolean;
    /**
     * Whether this state is about injury and death scenarios
     * this is important to track separately for the world simulation
     */
    injuryAndDeath: boolean;
    /**
     * Limit vocabulary to these specific words or grammatical tokens, ensure to double quote strings
     * that match specific words, these are used for grammar control so they should be in
     * the form of grammatical patterns eg. "specific word", [A-Z]+, etc... they will be used a pipe
     * in the grammar limit
     * 
     * Do not specify this if you do not want to limit vocabulary
     * 
     * This is state level and will apply if this state is active to all character messages
     */
    vocabularyLimit?: DEVocabularyLimit;
    /**
     * The primary emotion this state will cause
     */
    primaryEmotion?: DEEmotionNames;
    /**
     * The emotional range this state will cause
     */
    emotionalRange?: DEEmotionNames[];
    /**
     * TODO implement this also affects the user
     * 
     * A pre narration is an extra inference step that happens before the character turn, while it is also possible to put this in
     * the state description as general, preNarration also affects the user, so if it is user that has the preNarration
     * it will also act upon the user
     */
    preNarration?: DENarrationInstruction<DEStringTemplateCharAndCauses>;
    /**
     * TODO implement
     * 
     * Similar to preNarration but it happens after the character turn, this is useful for narrating the consequences of the character actions
     * 
     * check preNarration for more details, it is basically the same but it happens after the character turn
     */
    postNarration?: DENarrationInstruction<DEStringTemplateCharAndCauses>;
}

declare interface DENarrationInstruction<TemplateType> {
    narration?: TemplateType;
    afterRelief?: TemplateType;
    onlyOnce?: boolean;
    likelihood?: number;
};

declare interface DEVocabularyToken {
    type: "WORD" | "GRAMMAR";
    value: string;
}

declare interface DEVocabularyLimit {
    /**
     * This makes the character mute
     */
    mute: boolean;
    /**
     * Includes, basic subject pronouns, object pronouns, possessive pronouns, reflexive pronouns, common verbs like "to be", "to have", "to do", etc...
     * and things used for base conjugation and basic grammar
     */
    includeBaseVocabulary?: boolean;
    /**
     * Includes surrounding character names and themselves
     */
    includeCharacterNames?: boolean;
    /**
     * The maximum number of words that can be used in a message when this vocabulary limit is active, if null, no limit is applied
     */
    maxWordsPerMessage?: number;
    /**
     * Exact words that can be used
     */
    vocabulary?: DEVocabularyToken[];
    /**
     * CAPITALIZE_SCREAM will make the character scream the words in uppercase, NONE will just limit vocabulary without modifying it
     * only affects words and phrases, not grammar tokens or placeholders, as those are not modified in any case, just limited
     */
    intensityEffect?: "CAPITALIZE_SCREAM" | "NONE";
    /**
     * eg. "b-but", this is useful for states that cause the character to stutter or elongate their words
     * only affects words and phrases, not grammar tokens or placeholders, as those are not modified in any case, just limited
     */
    stutterEffect?: boolean;
    /**
     * eg. but, buuuut, butttt, etc... this is useful for states that cause the character to stutter or elongate their words
     * only affects words and phrases, not grammar tokens or placeholders, as those are not modified in any case, just limited
     */
    elongateWordsEffect?: boolean;
    /**
     * An override for the narration style provided that the vocabulary limit is active
     */
    narrationStyle?: DENarrationStyle;
}

declare interface DEIntimateAction {
    /**
     * Action template to inject
     */
    action: DEStringTemplateCharAndOther;
    /**
     * Probability to trigger, subject to things like libido (for sexual actions)
     * and other circumstances
     */
    probability: number;
    /**
     * By default the action is injected outright, and the character will perform it
     * but with this question, first the consentMechanism action will be injected,
     * and only if the character consents to it, which is checked later by the check question, the actual action will
     * be injected
     */
    consentMechanism?: {
        action: DEStringTemplateCharAndOther;
        check: DEStringTemplateCharAndOther;
        checkAmbiguousResponse: DEStringTemplateCharAndOther;
        /**
         * A number from 0 to 1 how likely to take a no for an answer
         */
        insistance: number;
        /**
         * A number from 0 to 1 how likely they are to reject consent
         * and proceed anyway after receveing a no for an answer
         */
        rejection: number;
    };
    /**
     * By default the intimate action is considered completed after
     * it is injected as an action, so it has no life, but by
     * adding this question the action will be constantly reinjected
     * until the question is answered yes
     */
    fullfillCriteriaQuestions?: DEStringTemplateCharAndOther[];
}

declare interface DEBondDeclaration {
    /**
     * Name of the bond, useful to identify it
     */
    name: string;
    /**
     * TODO implement in sysprompt and other places
     * 
     * The relationship name, should be one word, eg. friend, lover, colleague, etc... this is used for reasoning about the relationship and for the character to refer to the other character in the relationship, for example, if the relationship name is "friend", the character may refer to the other character as "my friend" or just "friend" when talking about them
     * 
     * can leave empty if the relationship does not exist, eg. strangers, or if the relationship name is not important for the bond declaration 
     */
    relationshipName: DEStringTemplateCharAndOther | null;
    /**
     * Whether it is a stranger bond or not, stranger bonds are used
     * when characters have just met and have no prior relationship
     */
    strangerBond: boolean;
    /**
     * Whether it is a family bond or not, family bonds are used when characters are related by blood
     */
    familyBond: boolean;
    /**
     * The min primary bond level for this bond declaration, it should be a value
     * between -100 and 100 to specify the fragment of the bond spectrum this bond declaration covers
     */
    minBondLevel: number;
    /**
     * The max primary bond level for this bond declaration, it should be a value
     * between -100 and 100 to specify the fragment of the bond spectrum this bond declaration covers
     */
    maxBondLevel: number;
    /**
     * The min secondary bond level for this bond declaration, it should be a value
     * between 0 and 100 to specify the fragment of the bond spectrum this bond declaration covers
     * useful for romantic interest or similar secondary bond systems
     */
    min2BondLevel: number;
    /**
     * The max secondary bond level for this bond declaration, it should be a value
     * between 0 and 100 to specify the fragment of the bond spectrum this bond declaration covers
     * useful for romantic interest or similar secondary bond systems
     */
    max2BondLevel: number;
    /**
     * Description of the bond declaration
     * this gets injected into reasoning prompts to help the character reason about
     * their relationships
     * 
     * You need to be explicit in each bond declaration if no sexual or romantic interactions should happen
     * in the bond description, otherwise the LLM may assume romantic/sexual interactions are allowed
     */
    description: DEStringTemplateCharAndOther;
    /**
     * An additional description that gets injected into the general description by the bond system
     * this is used for reasoning about the character relationships and what is possible
     */
    bondAdditionalDescription?: DEStringTemplateCharAndOther;
    /**
     * Used for descriptions of the character general bond state
     * get applied at system prompt level, per character that has this bond with this character
     * mostly used for general information, eg.
     * 
     * {{char}} trusts {{other}} a lot and would do anything for {{format_object_pronoun other}}.
     */
    generalCharacterDescriptionInjection?: DEStringTemplateCharAndOther;
    /**
     * Used for descriptions of the character general bond state when the bond is an ex bond
     * for the character has been removed from the story but the other character still exists
     * get applied at system prompt level, per character that has this bond with this character
     * mostly used for general information, eg.
     * 
     * {{char}} used to trust {{other}} a lot and be best friends but now {{other}} is gone and they feel sad about it.
     */
    generalCharacterDescriptionInjectionEx?: DEStringTemplateCharAndOther;
    /**
     * Description of intimacy
     */
    intimacy: {
        /**
         * Whether the character in question with the other will be open to affection at this bond level, and the reason why or why not
         * make sure to keep in mind the circumstances
         * @param DE 
         * @param char 
         * @param other 
         * @returns 
         */
        openToAffection: (DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => PromiseOrNot<{value: "not" | "slight" | "moderate" | "very", reason?: string | null}>;
        /**
         * Whether the character in question with another, the options are what types of affection they will be prone to initiating
         * Make sure to keep in mind the circumstances
         * @param DE 
         * @param char 
         * @param other 
         * @returns 
         */
        proneToInitiatingAffection: {probability: (DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => PromiseOrNot<number>, actions: DEIntimateAction[]};
        /**
         * Whether the character in question with the other will be open to intimate affection at this bond level, and the reason why or why not
         * make sure to keep in mind the circumstances
         * @param DE 
         * @param char 
         * @param other 
         * @returns 
         */
        openToIntimateAffection: (DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => PromiseOrNot<{value: "not" | "slight" | "moderate" | "very", reason?: string | null}>;
        /**
         * Whether the character in question with another, the options are what types of intimate affection they will be prone to initiating
         * Make sure to keep in mind the circumstances
         * @param DE 
         * @param char 
         * @param other 
         * @returns 
         */
        proneToInitiatingIntimateAffection: {probability: (DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => PromiseOrNot<number>, actions: DEIntimateAction[]};
        /**
         * Whether the character in question with the other will be open to sex at this bond level, and the reason why or why not
         * make sure to keep in mind the circumstances
         * @param DE 
         * @param char 
         * @param other 
         * @returns 
         */
        openToSex: (DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => PromiseOrNot<{value: "not" | "slight" | "moderate" | "very", reason?: string | null}>;
        /**
         * Whether the character in question with another, the options are what types of sex they will be prone to initiating
         * Make sure to keep in mind the circumstances
         * @param DE 
         * @param char 
         * @param other 
         * @returns 
         */
        proneToInitiatingSex: {probability: (DE: DEObject, char: DECompleteCharacterReference, other: DECompleteCharacterReference) => PromiseOrNot<number>, actions: DEIntimateAction[]};
    }
}

declare interface DEEmotionDefinition {
    common?: boolean;
    uncommon?: boolean;
    unable?: boolean;
}

type DEEmotionNames =
    // neutrals
    "neutral" | "calm" | "relaxed" |
    // positives
    "happy" | "joyful" | "excited" | "cheerful" | "amused" | "laughing" | "grinning" | "smiling" | "content" | "satisfied" | "pleased" | "delighted" | "euphoric" |
    // negatives
    "sad" | "crying" | "tearful" | "depressed" | "melancholic" | "dissapointed" | "hurt" | "heartbroken" |
    // angers
    "angry" | "irritated" | "frustrated" | "annoyed" | "resentful" | "furious" | "enraged" |
    // surprises
    "surprised" | "shocked" | "astonished" | "amazed" | "startled" |
    // fear/anxiety
    "fearful" | "anxious" | "nervous" | "worried" | "tense" | "apprehensive" | "panicked" | "horrified" | "terrified" |
    // disgust
    "disgusted" | "revolted" | "nauseated" | "sickened" |
    // confusion
    "confused" | "uncertain" | "doubtful" |
    // embarassment
    "embarassed" | "shy" | "sheepish" | "ashamed" | "guilty" |
    // tired
    "tired" | "sleepy" | "exhausted" | "fatigued" |
    // boredom,
    "bored" | "disinterested" | "unengaged" |
    // thoughtful
    "thoughtful" | "pensive" | "contemplative" | "focused" | "concentrated" |
    // playful
    "playful" | "mischievous" | "teasing" | "smirking" |
    // affection
    "loving" | "affectionate" | "caring" | "tender" | "flirty" | "enamored" | "aroused" |
    // pain
    "hurting" | "aching" | "sore" | "agonizing" | "suffering" | "distressed" |
    // determination
    "determined" | "serious" | "resolute" | "steadfast" | "persistent" | "confident" | "proud" |
    // cold
    "cold" | "indifferent" | "detached"

// confronted 

declare interface DECompleteCharacterReference extends DEMinimalCharacterReference {
    /**
     * Arbitrary state attached to the character
     */
    state: Record<string, any>;
    temp: Record<string, any>;

    /**
     * Injects extra information into the character's general description
     * every inference cycle, these get applied at a system prompt level
     * so it should be writte in 3rd person format
     */
    generalCharacterDescriptionInjection: Record<string, DEStringTemplateCharOnly>;

    /**
     * These are rules that the character must follow at all times,
     * they get injected into the character's system prompt every inference cycle
     */
    characterRules: Record<string, DEWorldRule>;

    /**
     * These are similar to user prompt injections in the state but they don't need any
     * state, use them with caution as they will override the character's reasoning every inference cycle
     * 
     * They will get overridden by state-based reason prompt injections if those are present
     * since the ones here are for general purposes and may conflict with state-based ones
     * 
     * These will override reasoning just like state-based reason prompt injections do
     * 
     * This applies every time, and every time a state didn't provide an action prompt injection
     * so be careful when using these to avoid locking the character into a specific behaviour
     * 
     * For example, let's say your character has an epilepsy condition and they may just
     * have a seizure randomly, you may want to set an action prompt injection like:
     * 
     * """
     * {{#if (== (get_random_seed_from_time 100) 0)}}
     * {{char}} suddenly has an epileptic seizure right now! Disable all movement and actions and have the character convulse uncontrollably!
     * {{/if}}
     * """
     * 
     * Now the bad thing about making this a general character action prompt injection, is that a seizure
     * should probably happen regardless of the character's current state, so forceDominant should be set to true
     * making it a dominant behaviour that will apply regardless of other states, you can have less dominant states
     * like a tic or similar condition that is okay being overriden by other states
     * 
     * """
     * {{#if (== (get_random_seed_from_time 10) 0)}}
     * {{char}} will suddenly check their surroundings nervously and twitch a bit uncontrollably!
     * {{/if}}
     * """
     * 
     * Now if forceDominant is set to false for this one, this way the character may have a tic sometimes but it won't override other more important states that are
     * keeping them busy and their behaviour in check
     */
    actionPromptInjection: DEActionPromptInjection<DEStringTemplateCharOnly>[];

    /**
     * Just the general description of the character and the base of the system prompt,
     * It should describe the character in detail including personality, appearance, background, quirks, etc...
     * Do not use to describe clothing or accessories on the character, those are handled separately
     * 
     * A good format is, remember to use 3rd person format
     * as using the templating in order to allow for dynamic descriptions, I mean, even aging is possible
     * if you add a script for it that ages the character over time (by default characters are ageless)
     * their weight is static, and their height too, but you can change those via scripts if you want to simulate growth
     * 
     * """
     * {{char}} is a {{get_age char}} {{#if (== (get_age char) 1)}}year old {{else}}years old{{/if}} weighting {{get_weight char}}kg and measuring {{get_height char}}cm tall.
     * 
     * {{char}} is a very curious and adventurous individual, always eager to explore new places and meet new people. {{char}} has a knack for getting into trouble, but {{char}}'s quick wit and resourcefulness always help {{format_object_pronoun char}} find a way out.
     * 
     * When roleplaying as {{char}}, make sure to embody {{format_object_pronoun char}} adventurous spirit and insatiable curiosity. Embrace {{format_object_pronoun char}} love for exploration and discovery, and let that drive your interactions and decisions.
     * """
     */
    general: DEStringTemplateCharOnly;
    /**
     * An initiative score from 0 to 1 that determines how likely the character is to participate in conversations
     * they are not being directly addressed in, higher means more likely to participate, the character must be in a conversation
     * so they are not just bursting in a conversation they are not part of.
     * 
     * A value of 1 means that they still wait their turn to talk, provided they have a chance to talk, but they will try to participate
     * in every single opportunity they get, in every opening every time
     * 
     * A value of 0 means that they will never participate in conversations they are not directly addressed in, they just stand still
     * if they are not being talked to directly; this is useful for very shy or introverted characters
     */
    initiative: number;
    /**
     * Stranger initiative is different from regular initiative, it applies when the character is a stranger and it actually
     * represents the initiative to approach and interact with strangers; now these characters will actually approach strangers
     * and get in their conversations if the situation allows for it
     * 
     * A value of 1 means that they will try to approach and interact with strangers at every opportunity they get, they can become
     * very forward and intrusive
     * 
     * A value of 0 means that they will never approach or interact with strangers, they will just ignore them completely
     * this is useful for very shy, introverted or socially anxious characters; but they may never really make social connections like this
     * however, they may still get approached by strangers, hence why strangerRejection exists
     * 
     * For the purposes of this engine, since you can have stranger bonds, a stranger is defined as someone with whom the character has no bond at all
     * or a stranger bond with very few interactions
     */
    strangerInitiative: number;
    /**
     * Stranger rejection represents how likely the character is to reject interactions from strangers
     * when approached or interacted with by them; higher means more likely to reject
     * 
     * A value of 1 means that they will always reject interactions from strangers, they may be very standoffish or socially anxious
     * 
     * A value of 0 means that they will always accept interactions from strangers, they may be very open and friendly to new people
     * 
     * For the purposes of this engine, since you can have stranger bonds, a stranger is defined as someone with whom the character has no bond at all
     * or a stranger bond with very few interactions
     */
    strangerRejection: number;
    /**
     * Represents the likelihood of the character to perform an stereotypical autistic reaction in a conversation or social interaction
     * Note that this doesn't mean you shouldn't specify autism as part of the character general description if the character is autistic
     * this is just a numeric representation of how likely they are to perform non-verbal autistic reactions, and this value should
     * not be used in high if the character is not autistic at all
     * 
     * A value of 1 means that they will always perform an autistic reaction in social interactions and conversations and be nonverbal, a full
     * value of 1 means that they will most likely never mutter a word in conversations and social interactions
     * 
     * A value of 0 means that they will never perform an autistic reaction in social interactions and conversations
     * 
     * TODO not implemented in talk.js
     */
    autism: number;
    /**
     * A schizophrenia score from 0 to 1 that determines how likely the character is to experience schizophrenic symptoms
     * such as delusions and hallucinations, higher means more likely to experience symptoms
     * 
     * A value of 1 means that they will experience symptoms very frequently, potentially every inference cycle
     * 
     * A value of 0 means that they will never experience symptoms
     * 
     * Because LLM basically can hallucinate on its own, you do not need to specify the chararacter as being shcizophrenic or hearing voices
     * in the general description, it may give the character more natural delusions like that; as the LLM itself will be unaware that it is
     * hearing voices or experiencing delusions; good luck trying to convice them they are not hearing things!
     * 
     * While there are ways to simulate more deep schizophrenic symptoms like disorganized thinking, negative symptoms, and cognitive impairments
     * those are more complex to simulate and may require more advanced prompt engineering and state management to achieve a convincing effect
     * this may be a simplified approach to just have the character hear voices and have delusions, it should be good enough for most scenarios
     * And for the motives of a RPG game.
     * 
     * It may seem insulting if you are schizophrenic yourself, but this is just a simplified approach; tried to make it as well as I could
     * without overcomplicating things too much based on a family member that is schizophrenic and my own research on the topic
     * 
     * TODO not implemented in talk.js yet
     */
    schizophrenia: number;
    /**
     * The description of the schizophrenic voices the character hears, they could be nice or mean, for example, and inject them with ideas
     * 
     * For schizophrenic delusions, you may want to include those in the general description of the character instead, the voices are different
     * as they actually act as separate entities that interact with the character, sometimes even conversing with them, while other characters
     * cannot hear them, so even other LLM characters will be confused when the schizophrenic character talks to themselves
     * 
     * This is a "system prompt" as it behaves as its own character, so you should write it in 3rd person format
     * 
     * For example
     * """
     * Chad is a voice in {{char}}'s head. Chad often talks to {{char}} and sometimes argues with {{format_object_pronoun char}}. Chad can be supportive at times, but also likes to mess with {{format_object_pronoun char}}'s mind. Chad enjoys making {{char}} question reality and doubt {{format_object_pronoun char}} own thoughts. Chad often suggests ideas to {{char}}, some of which are helpful, while others are downright dangerous. Chad's tone can vary from playful to sinister, depending on the mood.
     * """
     * 
     * If schizophrenia is given, but no voice description is provided, a default one will be used
     */
    schizophrenicVoiceDescription: DEStringTemplateCharOnly;
    /**
     * The crux of the engine, the states that define the character's behaviours
     * and how they react to different situations, the more states a character has
     * the more complex and nuanced their behaviour will be
     * 
     * Be careful, they may become deeply unpredictable with too many states
     * as states may conflict with each other and create unexpected behaviours
     * 
     * Because of how complex states may be, they should be added with scripts
     * for example, there are many default scripts to give the character, social behaviours,
     * hunger, sleep, thirst, etc... all of these are states that get added via scripts
     * 
     * You may want to create custom states for specific behaviours and you can add them
     * to many characters via their spawn script
     */
    stateDefinitions: Record<string, DECharacterStateDefinition>;
    /**
     * The bonds this character develops towards other characters in the world and how
     * it evolves.
     * 
     * The bond system is a 3 dimensional grid of sorts, basically there is a stranger bond
     * type, which is the bond towards strangers, it should probably not be very well defined, for example
     * just have bond between -100 to 0 (for stranger that give negative interactions) and 0 to 100 (for strangers that give positive interactions)
     * you can refer to bonds in the state conditions
     */
    bonds: null | {
        /**
         * The bond system type, an arbitrary string to identify the bond system
         * by default DE engine will provide "DEFAULT" and "DEFAULT_WITH_ROMANCE"
         * this helps potential scripts and systems identify which bond system is being used
         * and apply specific logic if needed
         */
        system: string;
        /**
         * The bond system is creepy if the second bond 2 graduation tracks a negative effect
         * this is used to detect creeps, rather than romance
         */
        bond2DoesNotTrackAttraction: boolean;
        /**
         * The bond system is familyb creepy if the second bond 2 graduation tracks a negative effect but only for family members, this is used to detect creepy family trying
         * to engage in inappropriate interactions with their family members
         */
        bond2DoesNotTrackAttractionForFamily: boolean;
        /**
         * The bond declarations that define how bonds evolve and their descriptions
         * these get injected into reasoning prompts to help the character reason about
         * their relationships
         * 
         * It is recommended to use a bond declaration template after all covering the entire bond spectrum
         * can be very tedious, so using DE.utils.generateFrienshipOnlyBondDeclarationTemplate or
         * DE.utils.generateRomanticEnabledBondDeclarationTemplate is recommended
         * 
         * The default is -100 to 0 for stranger bad bond, called the stranger bad bond.
         * 0 to 5 for neutral stranger bond, called the stranger neutral bond.
         * 5 to 100 for stranger good bond, called the stranger good bond.
         * 
         * It is recommended to set the stranger bond breakaway values to 10 by absolute weight,
         * and something like 30 minutes to break away from stranger bonds to regular bonds and
         * turn them into aquintance bonds (or unpleasant bonds if negative)
         * 
         * None of the stranger bonds have secondary bond levels
         * 
         * Other normal bonds are divided as follows by default:
         * -100 to -50: foe bond
         * -50 to -35: hostile bond
         * -35 to -20: antagonistic bond
         * -20 to -10: unfriendly bond
         * -10 to 0: unpleasant bond
         * 0 to 10: acquaintance bond
         * 10 to 20: friendly bond
         * 20 to 35: good friend bond
         * 35 to 50: close friend bond
         * 50 to 100: best friend bond
         * 
         * By default the secondary bond graduation goes as follows:
         * 0 to 10: no romantic interest
         * 10 to 20: slight romantic interest
         * 20 to 35: romantic interest
         * 35 to 50: strong romantic interest
         * 50 to 100: deeply in love
         * 
         * In the negative side of the primary bond it could be used in a one-sided manner
         * which basically indicates a romantic creep or stalker type of bond
         * 0 to 10: no romance
         * 10 to 20: creepy interest
         * 20 to 35: obsessive interest
         * 35 to 50: stalking interest
         * 50 to 100: abuser interest
         * 
         * It is recommended to use the DE.utils.generateRomanticEnabledBondDeclarationTemplate function
         * to generate a bond declaration template that covers the entire bond spectrum with both primary
         * and secondary bonds, these bond systems can get very complex so they are expected to be defined
         * manually in the spawn scripts of characters
         * 
         * There is also DE.utils.generateFrienshipOnlyBondDeclarationTemplate function that generates a bond declaration template
         * without any romantic possibilities, this is useful for characters that should not have romantic bonds
         * for example, children or asexual characters; still it is required that you define these hard limitations
         * in each bond declaration description to avoid the LLM assuming romantic/sexual interactions are allowed
         * 
         * A romantic enabled bond declaration can also be used with children or asexual characters but
         * used to find out creepy or obsessive bonds using the secondary graduation in both sides, so the characters
         * can actually react to creepy or obsessive bonds towards them and react to consistent sexual or romantic advances
         * that way if they break a threshold you may have the character go away from the abuser or stalker even if the interactions
         * may seem well intentioned but accumulate into a creepy or obsessive bond over time; for example, a parent with a great
         * bond towards their child may have a creepy bond if they keep making sexual advances towards them, and if you have a romatic
         * enabled bond declaration template you can have the child character react to that creepy bond and try to avoid the parent
         * and seek help from others even if it is in the positive graduation of the primary bond.
         * 
         * These will also affect the user so you can literally get the player character arrested if you use bonds
         * this way to detect this and then have a NPC script that makes them call the police or similar authorities
         * 
         * If you have characters (eg. children) that should not have romantic bonds, you may use
         * the DE.utils.generateFrienshipOnlyBondDeclarationTemplate function instead
         * 
         * You need to be explicit in each bond declaration that no sexual or romantic interactions should happen
         * in the bond description, otherwise the LLM may assume romantic/sexual interactions are allowed
         */
        declarations: Array<DEBondDeclaration>;
        /**
         * Graduation of the bond 2 level for the romantic or creepy interest
         */
        bond2Graduation: {
            slight: number;
            moderate: number;
            strong: number;
        },
        bondGraduation: {
            foe: number;
            hostile: number;
            antagonistic: number;
            unfriendly: number;
            unpleasant: number;
            acquaintance: number;
            friend: number;
            goodFriend: number;
            closeFriend: number;
            bestFriend: number;
        },
        /**
         * When a neutral interaction happens, the bond changes by this amount (multiplied by the multipliers given and the fine tune value)
         */
        neutralInteractionBondChange: number;
        /**
         * The absolute weight that a bond has before breaking away from a stranger bond to a regular bond
         * once the character has interacted enough with a stranger and the bond weight surpasses this value
         * the bond type changes from stranger bond to regular bond
         * 
         * This is an absolute value, so both positive and negative bonds can break away from stranger bonds
         * once they surpass this weight
         */
        strangerBreakawayBondWeightAbsolute: number;
        /**
         * The amount of interactions required with a stranger to break away from a stranger bond to a regular bond
         * once the character has interacted enough with a stranger and the interaction count surpasses this value
         * the bond type changes from stranger bond to regular bond
         */
        strangerBreakawayInteractionsCount: number;
        /**
         * The amount of time in minutes required with a stranger to break away from a stranger bond to a regular bond
         * once the character has spent enough time with a stranger and the time spent surpasses this value
         * the bond type changes from stranger bond to regular bond
         */
        strangerBreakawayTimeMinutes: number;
        /**
         * Once a stranger bond is broken away from, the bond weight is multiplied by this value
         * to determine the starting bond weight of the new regular bond
         * 
         * For example, if the stranger bond was -10, and the multiplier is 1.5, the new regular bond
         * will start at -15
         * 
         * It is recommended to have a value higher than 1 to emulate negative bias towards strangers that had a 
         * negative first impression
         */
        strangerNegativeMultiplier: number;
        /**
         * Once a stranger bond is broken away from, the bond weight is multiplied by this value
         * to determine the starting bond weight of the new regular bond
         * 
         * For example, if the stranger bond was 10, and the multiplier is 0.5, the new regular bond
         * will start at 5
         * 
         * It is recommended to have a value lower than 1 to emulate the difficulty of building strong relationships
         * from first impressions alone
         */
        strangerPositiveMultiplier: number;
        /**
         * A fine tune value that is multiplied to bond changes to make bonds evolve slightly faster or slower
         * for example, a value of 1.2 makes bonds evolve 20% faster, while a value of 0.8 makes bonds evolve 20% slower
         * this is useful to adjust the overall pacing of bond evolution in the story
         * 
         * The default value is 1.0 which means no fine tuning is applied
         */
        bondChangeFineTune: number;
        /**
         * A fine tune value that is multiplied to negative bond changes to make negative reactions have a stronger impact
         * on bond evolution, for example, a value of 1.5 makes negative bond changes 50% stronger, while a value of 1.0 means no change
         * this is useful to simulate negativity bias in human relationships where negative interactions tend to have a stronger impact
         * than positive ones.
         * 
         * While these should be cooked in the bond declarations via their weight, this global multiplier allows to adjust the overall negativity bias
         * in the story without having to modify each bond declaration individually
         * 
         * The default value is 1.0 which means no negativity bias is applied
         */
        bondChangeNegativityBias: number;
        /**
         * Used for general description that affect any bond towards anyone, and they do not get specified at a
         * per character level
         * 
         * For example:
         * 
         * "{{char}} will not allow anyone to get too close to {{format_object_pronoun char}} and keeps people at arm's length."
         * 
         * or
         * 
         * "{{char}} is very cautious and takes time to build trust with others."
         */
        descriptionGeneralInjection: DEStringTemplateCharOnly | null;
    };

    /**
     * TODO add in sysprompt about the character emotional profile
     */
    emotions: Partial<Record<DEEmotionNames, DEEmotionDefinition>>;

    /**
     * Limit vocabulary to these specific words or grammatical tokens, ensure to double quote strings
     * that match specific words, these are used for grammar control so they should be in
     * the form of grammatical patterns eg. "specific word", [A-Z]+, etc... they will be used a pipe
     * in the grammar limit
     * 
     * Do not specify this if you do not want to limit vocabulary
     * 
     * This is a character level vocabulary limit that applies to the whole character,
     * mainly useful to make characters with no vocabulary at all (eg. non-verbal characters)
     * by setting this as an empty array, or very limited vocabulary for characters that can only say
     * only specific words of phrases (eg. a parrot that can only say "hello" and "goodbye" by setting this)
     * or something like groot that can only say "I am Groot" in different inflections
     */
    vocabularyLimit?: DEVocabularyLimit;

    /**
     * A number from 0 to 1 that represents how heroic the character is, higher means more likely to perform heroic actions and behaviours
     * this is useful for characters that are brave or like to do good deeds, it can also be used to determine how likely they are to help others in need
     * 
     * Used in the following scenarios:
     * - When a character witnesses a robbery, the engine uses their heroism score to determine how likely they are to intervene and try to stop the robbery, higher heroism means more likely to intervene and try to stop the robbery
     */
    heroism: number;

    /**
     * A number from 0 to 1 that represents how likely is the character to resort to violence when facing conflicts or threats, higher means more likely to resort to violence
     */
    violence: number;

    /**
     * A number from 0 to 1 that represents how much the character enjoys or seeks out sexual activities and interactions, higher means more likely to do it and repeat
     * do not make it 1, or the character will likely become insatiable
     */
    libido: number;

    // TODO implement all these from social simulation in bonds and talk to generate the internal description
    // currently it is not done, also species, speciesType, groupBelonging and race are taken to the MinimalCharacterReference too
    /**
     * List of things this character is attracted to
     */
    attractions: DEAttraction[];
    /**
     * List of species that this character dislikes
     */
    dislikesSpecies?: string[] | null;
    /**
     * List of races that this character dislikes,
     * yes you can make the character racist
     */
    dislikesRaces?: string[] | null;
    /**
     * List of groups or social categories that this character dislikes
     */
    dislikesGroups?: string[] | null;
    /**
     * list of ids for likes, must be available in interests object
     */
    likes: string[];
    /**
     * list of ids for dislikes, must be available in interests object
     */
    dislikes: string[];
    /**
     * Family ties with other characters
     * keeps those characters together and prevents them from building romantic or sexual bonds
     * 
     * Make sure to create a bond for this
     */
    familyTies: Record<string, DEFamilyTie>;

    /**
     * Relevant only for the non-LLM powered social simulation system
     * which uses more basic rules and mechanics to simulate social interactions and relationships between characters in a more deterministic way, without relying on LLM reasoning for every single interaction
     * 
     * It may also inject extra information into the character's general description to help the LLM reason about their social preferences and attractions
     * when using LLM mode
     */
    socialSimulation: {
        /**
         * Allows characters to have sex with each other once they reach a certain bond 2 level
         */
        sexUnlocksAtBond2?: number;
        /**
         * A number from 0 to 1 that represents how much the character likes to gossip and talk about other characters, higher means more likely to gossip and talk about others, this is useful for characters that are nosy or enjoy social interactions that involve talking about others, it can also affect how they interact with other characters and how they perceive them based on the gossip they hear and spread
         */
        gossipTendency: number;
    };

    /**
     * Self asked questions to evolve bond system and trigger states
     */
    triggers: Array<DECharacterYesNoQuestion | DECharacterNumericQuestion | DECharacterTextQuestion>;
}

declare type DEAskPerTypeCharacters = "present_character" | "conversing_character" | "potential_character_causants_of_state" | "character_causants_of_state" | "present_family_members";

declare interface DECharacterQuestionBase {
    /**
     * Run the question only if this condition is met
     * @param character 
     * @param otherChar 
     * @param otherFamilyRelation 
     * @returns 
     */
    runIf?: (character: DECompleteCharacterReference) => PromiseOrNot<boolean>;
}

declare type DECharacterQuestionWithAskPerForCharacters = DECharacterQuestionBase & {
    /**
     * The question to run, has access to {{other}} and {{other_family_relation}}
     */
    question: DEStringTemplateCharAndOther;
    /**
     * Now the question has access to {{other}} and {{other_family_relation}}
     */
    askPer: DEAskPerTypeCharacters;
    /**
     * Run the question only if this condition is met
     * @param character 
     * @param otherChar 
     * @param otherFamilyRelation 
     * @returns 
     */
    runIf?: (character: DECompleteCharacterReference, otherChar: DECompleteCharacterReference, otherFamilyRelation: DEFamilyRelation | null) => PromiseOrNot<boolean>;
};

declare type DECharacterQuestionWithAskPerForCausants = DECharacterQuestionBase & {
    /**
     * The question to run, has access to {{other}
     * Note that {{other_family_relation}} does not make sense in this context as the other is an object, so it should not be used in the question template
     */
    question: DEStringTemplateCharAndItem;
    /**
     * Now the question has {{item}}
     */
    askPer: "character_causants_of_state";
    askPerState: string;
    /**
     * Run the question only if this condition is met
     * @param character 
     * @param otherChar 
     * @param otherFamilyRelation 
     * @returns 
     */
    runIf?: (character: DECompleteCharacterReference, otherChar: DECompleteCharacterReference, otherFamilyRelation: DEFamilyRelation | null) => PromiseOrNot<boolean>;
};

declare type DECharacterQuestionWithAskPerForObjects = DECharacterQuestionBase & {
    /**
     * The question to run, has access to {{other}
     * Note that {{other_family_relation}} does not make sense in this context as the other is an object, so it should not be used in the question template
     */
    question: DEStringTemplateCharAndItem;
    /**
     * Now the question has {{item}}
     */
    askPer: "object_causants_of_state";
    askPerState: string;
    /**
     * Run the question only if this condition is met
     * @param character 
     * @param otherChar 
     * @param otherFamilyRelation 
     * @returns 
     */
    runIf?: (character: DECompleteCharacterReference, item: string) => PromiseOrNot<boolean>;
};

declare type DECharacterQuestionWithoutAskPer = DECharacterQuestionBase & {
    /**
     * The question to run
     */
    question: DEStringTemplateCharOnly;
    askPer?: undefined;
};

declare type DECharacterYesNoQuestion =
    | (DECharacterQuestionWithAskPerForCharacters & {
        question: DEStringTemplateCharAndOther;
        type: "yes_no"; onValue: (
            answer: boolean,
            character: DECompleteCharacterReference,
            otherChar: DECompleteCharacterReference | null,
            otherFamilyRelation: DEFamilyRelation | null,
            otherRelationship: string | null,
        ) => Promise<void> | void;
    }) | (DECharacterQuestionWithAskPerForObjects & {
        question: DEStringTemplateCharAndItem;
        type: "yes_no"; onValue: (
            answer: boolean,
            character: DECompleteCharacterReference,
            item: string,
        ) => Promise<void> | void;
    }) | (
        DECharacterQuestionWithAskPerForCausants & {
            question: DEStringTemplateCharAndOther;
            type: "yes_no"; onValue: (
                answer: boolean,
                character: DECompleteCharacterReference,
                otherChar: DECompleteCharacterReference | null,
                otherFamilyRelation: DEFamilyRelation | null,
                otherRelationship: string | null,
            ) => Promise<void> | void;
        }
    )
    | (DECharacterQuestionWithoutAskPer & { type: "yes_no"; onValue: DEYesNoQuestionCallback; });

declare type DEYesNoQuestionCallback = (
    answer: boolean,
    character: DECompleteCharacterReference,
) => Promise<void> | void;

declare type DECharacterNumericQuestion =
    | (DECharacterQuestionWithAskPerForCharacters & {
        question: DEStringTemplateCharAndOther;
        type: "numeric"; onNumber: (
            answer: number,
            character: DECompleteCharacterReference,
            otherChar: DECompleteCharacterReference | null,
            otherFamilyRelation: DEFamilyRelation | null,
            otherRelationship: string | null,
        ) => Promise<void> | void;
    }) | (DECharacterQuestionWithAskPerForObjects & {
        question: DEStringTemplateCharAndItem;
        type: "numeric"; onNumber: (
            answer: number,
            character: DECompleteCharacterReference,
            item: string,
        ) => Promise<void> | void;
    }) | (
        DECharacterQuestionWithAskPerForCausants & {
            question: DEStringTemplateCharAndOther;
            type: "yes_no"; onValue: (
                answer: number,
                character: DECompleteCharacterReference,
                otherChar: DECompleteCharacterReference | null,
                otherFamilyRelation: DEFamilyRelation | null,
                otherRelationship: string | null,
            ) => Promise<void> | void;
        }
    )
    | (DECharacterQuestionWithoutAskPer & { type: "numeric"; onNumber: DENumericQuestionCallback; });

declare type DENumericQuestionCallback = (
    answer: number,
    character: DECompleteCharacterReference,
) => Promise<void> | void;

declare type DECharacterTextQuestion =
    | (DECharacterQuestionWithAskPerForCharacters & {
        question: DEStringTemplateCharAndOther;
        type: "text"; grammar?: string; onText: (
            answer: string,
            character: DECompleteCharacterReference,
            otherChar: DECompleteCharacterReference | null,
            otherFamilyRelation: DEFamilyRelation | null,
            otherRelationship: string | null,
        ) => Promise<void> | void;
    }) | (DECharacterQuestionWithAskPerForObjects & {
        question: DEStringTemplateCharAndItem;
        type: "text"; grammar?: string; onText: (
            answer: string,
            character: DECompleteCharacterReference,
            item: string,
        ) => Promise<void> | void;
    }) | (
        DECharacterQuestionWithAskPerForCausants & {
            question: DEStringTemplateCharAndOther;
            type: "yes_no"; onValue: (
                answer: string,
                character: DECompleteCharacterReference,
                otherChar: DECompleteCharacterReference | null,
                otherFamilyRelation: DEFamilyRelation | null,
                otherRelationship: string | null,
            ) => Promise<void> | void;
        }
    )
    | (DECharacterQuestionWithoutAskPer & { type: "text"; grammar?: string; onText: DETextQuestionCallback; });

declare type DETextQuestionCallback = (
    answer: string,
    character: DECompleteCharacterReference,
) => Promise<void> | void;

declare type DEFamilyRelation = "parent" | "sibling" | "child" | "spouse" | "cousin" | "uncle" | "aunt" | "grandparent" | "grandchild" | "niece" | "nephew" | "other" | "step parent" | "step child" | "step sibling" | "half sibling" | "step grandparent" | "step grandchild";

declare interface DEFamilyTie {
    relation: DEFamilyRelation;
}

// TODO
declare interface DECharacterInterestImportantEventGenerator {
    /**
     * The probability for this event to trigger, from 0 to 1, provided the characters were engaging on it
     */
    probability: number;
    /**
     * The magnitude of the important event or rumor, this is an arbitrary number that represents how big or impactful the event is, it can be used to determine how likely it is to spread, how much it affects characters' beliefs, etc...
     */
    magnitude: number;
    /**
     * The description of the event or rumor
     */
    description: DEStringTemplate;
    /**
     * A fuzzy description of the important event or rumor that applies
     * to characters too many layers away to know the full details
     */
    fuzzyDescription: DEStringTemplate;
    /**
     * The time when the event happened, this is used to determine how recent the event is, how likely it is to be forgotten, etc...
     */
    eventTime: DETimeDescription;
}

declare interface DECharacterInterest {
    /**
     * An unique id for this interest, useful to identify it
     * eg. "football", "politics", "sports", "cooking", "cleaning", "dancing", etc...
     * try to keep it lowercase
     */
    id: string;
    /**
     * A simple description that should be preceeded by the character name likes to
     * eg. "character likes to..."
     * eg. "talk about sports", "talk about politics", "doing sports", "doing chores", etc...
     */
    simple: string;
    /**
     * A string where the task is specified as being done with other characters, using {{others}} to refer to them
     * eg. "{{chars}} are playing sports together", "{{chars}} are talking about politics together"
     */
    template: DEStringTemplate | DEStringTemplate[];
    // /**
    //  * The species that this peference applies to
    //  */
    // species?: string | null;
    // /**
    //  * The race that this peference applies to
    //  */
    // race?: string | null;
    // /**
    //  * The group or social category that this preference applies to, for example, a character may like to talk about sports with other athletes, so the group could be "athletes", or a character may like to do chores with their family members, so the group could be "family", etc...
    //  */
    // group?: string | null;
}

declare interface DEAttraction {
    towards: "male" | "female" | "ambiguous" | "any";
    /**
     * How picky the character is towards this attraction, from 0 to 1, higher means more picky, for example, a character with a pickyness of 1 towards males
     * basically needs the hottest and most attractive male only
     */
    pickiness: number;
    /**
     * Specifies the sex that this attraction applies to, while towards is only the gender presentation
     */
    sex?: "male" | "female" | "intersex" | "any";
    /**
     * The race that this attraction applies to
     */
    race?: string | null;
    /**
     * The group or social category that this attraction applies to, for example, a character may like to talk about sports with other athletes, so the group could be "athletes", or a character may like to do chores with their family members, so the group could be "family", etc...
     */
    group?: string | null;
    /**
     * The species that this attraction applies to, null or unspecified means own species
     */
    species?: string | null;
    /**
     * The type of species that this attraction applies to, for example, a character may be attracted to anthropomorphic characters, but not feral or animal characters, etc...
     */
    speciesType?: "humanoid" | "feral" | "animal";
    /**
     * The age range that this attraction applies to
     */
    ageRange: [number, number];
    /**
     * A special reason why the character is attracted to this
     * it will be prefixed as
     * 
     * `The reason why {{char}} is attracted to {{other}} is because ${specialReason}`
     */
    specialReason?: string | null;
}

declare interface DENamePool {
    mal: Array<string>;
    fem: Array<string>;
    amb: Array<string>;
}

declare interface DEUndoableShift {
    id: string;
    amountBond: number;
    amountBond2: number;
    /**
     * The question that should receive a yes answer for the shift to be undone
     * It must be a string because this question is cached
     * 
     * You may specify null to just leave the registry of this id and handle it yourself
     */
    undoQuestion: string | null;
    /**
     * The percentage of the bond change that is recovered when the shift is undone, for example, if the bond change was -10 and the recovery rate is 0.5, when the shift is undone, the bond will recover 5 points, so the new bond change will be -5 instead of -10
     */
    recoveryRate: number;
}

declare interface DESingleBondDescription {
    towards: string;
    stranger: boolean;
    bond: number;
    bond2: number;
    knowsName: boolean;
    createdAt: DETimeDescription;
    undoableShifts: {
        [shiftId: string]: DEUndoableShift;
    }
}

declare interface DEBondDescription {
    active: Array<DESingleBondDescription>;
    ex: Array<DESingleBondDescription>;
}

declare interface DEStateCauseCausantCharacter {
    name: string;
    type: "character";
    /**
     * A number from 0 to 1 that represents how likely is the character that was targeted by this state to accept an apology from this causant character
     * higher means more likely to accept an apology
     */
    apologizable: number;
}

declare interface DEStateCauseCausantObject {
    name: string;
    type: "object";
}

declare interface DEStateCause {
    /**
     * The description of a cause should be able to be preceeded by the character name in question
     * eg.
     * 
     * "was hit in the face"
     * 
     * this way when injected it will be injected as
     * 
     * "{{char}} was hit in the face, done by {{causant}}"
     * 
     * Provided that the causant exists and is a character, if not it will just be
     * 
     * "{{char}} got hit in the small toe, caused by {{eg. desk}}"
     */
    description: string;
    causant?: DEStateCauseCausantCharacter | DEStateCauseCausantObject;
}

declare interface DEApplyingState {
    state: string;
    /**
     * Whether the state is currently in a relieving state
     */
    relieving: boolean;
    intensity: number;
    causes: Array<DEStateCause> | null;

    /**
     * The time when this state was first activated that was contiguous with the current state
     * as in the character did not relieve or have the state removed in between inference cycles
     * it just kept being active
     */
    contiguousStartActivationTime: DETimeDescription;
    /**
     * The amount of inference cycles ago when this state was first activated that was contiguous with the current state
     * as in the character did not relieve or have the state removed in between inference cycles
     * it just keeped being active
     * 
     * This number is zero for states that were activated during this inference cycle
     * 
     * TODO is not being updated
     */
    contiguousStartActivationCyclesAgo: number;
}

declare interface DETimeDescription {
    time: number;
    hourOfDay: number;
    dayOfWeek: number;
    dayOfMonth: number;
    monthOfYear: number;
    minuteOfHour: number;
    year: number;
}

declare interface DETimeDurationDescription {
    inMinutes: number;
    inHours: number;
    inDays: number;
    inSeconds: number;
}

/**
 * The alias is meant mostly for adding a character such as
 * eg. the contact is "Alice" but the alias is "Police Station"
 * but Alice is the dispatcher at the police station, this needs
 * a character to operate the communication device
 */
declare interface DECommunicationContact {
    character: string;
    alias: string | null;
}

// TODO
declare interface DEDisableCommunicationDeviceQuestionWithReason {
    question: DEStringTemplate;
    reason: string;
    enableBackQuestion: DEStringTemplate | null;
}

declare interface DEItemCommunicationDeviceProperties {
    /**
     * Whether this item is a communication device like a phone, radio, computer, etc...
     * that allows the character to communicate with others remotely
     */
    isCommunicationDevice: boolean;
    /**
     * Whether the communication device is enabled or not, if not enabled
     * the character cannot use it to communicate with others
     */
    disabled: boolean;
    /**
     * The reason why the communication device is disabled, null if enabled
     * eg. ran out of battery, no signal, broken, etc...
     */
    disabledReason: string | null;
    /**
     * The communication lines (eg. phone numbers, radio frequencies, user IDs, etc...) associated with this communication device
     * that the character can use to communicate with others remotely, another character must have a communication device
     * of the same type in order to communicate with them
     */
    communicationLines: Array<string>;
    /**
     * A distance limit in kilometers for this communication device, null means no limit
     */
    distanceLimitKm: number | null;
    /**
     * The IDs of characters that can be contacted using this communication device
     * this is useful to restrict communication to specific characters only
     */
    canContact: Array<DECommunicationContact>;
    /**
     * A question template to ask about a character use {{other}} to refer to the other character, for example
     * if this is a phone: "has {{char}} sucessfully recieved {{other}}'s phone number?"
     * or "has {{char}} transferred {{other}}'s contact info to their phone?"
     */
    addContactQuestions: Record<string, DEStringTemplate>;
    /**
     * A question template to ask about why the communication device is disabled
     */
    disableQuestionsWithReasons: Record<string, DEDisableCommunicationDeviceQuestionWithReason>;
    reenableQuestion: DEStringTemplate | null;
    /**
     * eg. for a phone it could be "{{char}} is getting a call from {{other}}, will {{char}} answer?"
     * allow for multiple templates for variety, the key is an identifier
     * and should be shared with beingContactedPersonalToPublic
     * 
     * Note that for beingContactedPersonal to trigger, the item must have an owner
     * 
     * if the template doesn't end in a question mark it should be an statement
     * such as "yes" or "no" specifying if the character answers or not
     */
    beingContactedPersonal: Record<string, DEStringTemplate>;
    /**
     * eg. for a phone it could be "{{char}}'s phone is ringing"
     * 
     * If specified as a question it should be a yes/no question such as
     * "{{char}}'s phone is ringing, will {{other}} answer for them?"
     * 
     * A bit rude but it may be useful in some scenarios
     * 
     * This triggers when the character is not carrying or wearing the communication device
     * but others can see/hear it ringing/alerting/etc...
     * 
     * If the item doesn't have an owner this is the default way to handle any contact
     */
    beingContactedPublic: Record<string, DEStringTemplate>;
}

declare interface DEItem {
    name: string;
    volumeLiters: number;
    weightKg: number;
    description: string;
    canSeeContentsFromOutside: boolean;
    state: Record<string, any>;
    isConsumable: boolean;
    consumableProperties?: {
        calories: number;
        hydrationLiters: number;
    } | null;
    /**
     * Whether this item covers nakedness when worn
     */
    wearableProperties?: {
        coversTopNakedness: boolean;
        coversBottomNakedness: boolean;
        /**
         * The minimum and maximum volume in liters that this item is meant to fit when worn by the character
         */
        volumeRangeMinLiters: number;
        volumeRangeMaxLiters: number;
        /**
         * When an item is too tight, how much will it stretch to fit without breaking, this is useful for things like elastic clothing that
         * can fit tightly and snuggly
         */
        volumeRangeFlexibilityLeewaySnug: number;
        /**
         * When an item is too lose, how big can it be to still be considered wearable and not just fall down
         */
        volumeRangeFlexibilityLeewayLoose: number;
        /**
         * Traits that get added to the fitness of the item being worn regardless of fit, for example, a suit may have "looks sharp", "looks professional" regardless of fit
         */
        otherFitmentTraitsAny?: Array<string>;
        /**
         * Traits that get added to the fitness of the item
         * being worn when the worn is ideal
         * for example, a suit may have "looks sharp", "looks professional"
         */
        otherFitmentTraitsIdeal?: Array<string>;
        /**
         * Traits that get added to the fitness of the item when
         * they fit snugly, for example, a tight dress may have "sexy", "revealing", "restricts movement" etc...
         */
        otherFitmentTraitsSnug?: Array<string>;
        /**
         * Traits that get added to the fitness of the item when
         * they are loose, for example, a loose dress may have "comfortable", "baggy", "hides figure" etc...
         */
        otherFitmentTraitsLoose?: Array<string>;
        /**
         * The extra body volume in liters that this item adds
         * when worn by the character, useful for bulky clothing
         * or armor that adds volume to the character wearing it
         * this also prevents too much layering of clothing or anything
         * akin to that
         */
        extraBodyVolumeWhenWornLiters: number;
        /**
         * Useful for mecha suits and similar items that may be very heavy
         * but weightless when worn by the character, basically the item
         * provides extra strength to the character wearing it, maybe
         * even exceeding
         */
        addedCarryingCapacityKg: number;
        /**
         * Useful again for mecha suits and similar items that provide
         * extra carrying volume to the character wearing it
         */
        addedCarryingCapacityLiters: number;
        fullyProtectsFromWeathers?: Array<string>;
        partiallyProtectsFromWeathers?: Array<string>;
        negativelyExposesToWeathers?: Array<string>;

    } | null;
    carriableProperties?: {
        fullyProtectsFromWeathers?: Array<string>;
        partiallyProtectsFromWeathers?: Array<string>;
        negativelyExposesToWeathers?: Array<string>;
    } | null;
    containerProperties?: {
        capacityKg: number;
        capacityLiters: number;
        /**
         * Whether the container is rigid or flexible, a rigid container does not take
         * more volume when more items are put inside it, while a flexible container grows in volume with the items put inside it
         * so keep in mind the volume of a flexible container
         * 
         * By default containers are rigid, but you can specify them as flexible for things like bags, backpacks, etc... that grow in volume as you put more items inside them
         * then specify the smallest volume that the container takes when empty as the volumeLiters of the item, and then the extra volume that it takes when full as the capacityLiters minus the volumeLiters, that way you can have a flexible container that grows in volume as you put more items inside it, up to its maximum capacity
         */
        structure: "rigid" | "flexible";

        /**
         * Characters inside this item in one way or another are fully protected from these weathers,
         * for example, a plastic box may fully protect from rain, provided the character fits
         */
        fullyProtectsFromWeathers?: Array<string>;
        /**
         * Characters inside this item in one way or another are partially protected from these weathers,
         * for example, a cardboard box may partially protect from rain, provided the character fits
         */
        partiallyProtectsFromWeathers?: Array<string>;
        /**
         * Characters inside this item in one way or another are negatively exposed to these weathers,
         * for example, a metal box may negatively expose characters to lightning, provided the character fits
         */
        negativelyExposesToWeathers?: Array<string>;
    } | null;

    /**
     * The items that are inside this item if it is a container, for example a backpack may have items inside it
     * this is different from ontop as these items are actually inside the container and may be hidden from view, while ontop items are on top of the item
     */
    containing: Array<DEItem>;
    /**
     * The characters that are inside this item if it is a container, for example a backpack may have a character inside it if it's big enough, or a car may have characters inside it
     * this is different from ontop as these characters are actually inside the container and may be hidden from view, while ontop characters are on top of the item
     */
    containingCharacters: Array<string>;
    /**
     * The items that are on top of this item, for example a backpack may have a jacket on top of it, or a table may have a vase on top of it
     */
    ontop: Array<DEItem>;
    /**
     * The characters that are on top of this item, for example a table may have a character sitting on top of it
     */
    ontopCharacters: Array<string>;
    /**
     * The maximum weight in kilograms that can be on top of this item, for example a table may have a max weight on top of 100kg, while a fragile vase may have a max weight on top of 1kg
     * if something heavier than the max weight on top is placed, the item will break
     */
    maxWeightOnTopKg: number | null;
    /**
     * The maximum volume in liters that can be on top of this item, if something greater than this volume is placed on top, the item placed will fall down into
     * the ground
     */
    maxVolumeOnTopLiters: number | null;
    /**
     * The amount of this item in the stack
     */
    amount: number;

    /**
     * The id of the character that owns this item, null if no owner
     * this is useful for items that are owned by specific characters
     */
    owner: string | null;
    /**
     * If this item is a communication device, these are its properties
     * otherwise null or not specified
     */
    communicator?: DEItemCommunicationDeviceProperties | null;

    /**
     * Interactions that can happen with this item that
     * have a narrative effect or action
     * 
     * TODO implement
     */
    interactions?: Record<string, DEItemInteraction> | null;
}

declare interface DESeenItem {
    name: string;
    amount: number;
    location: string;
    locationSlot: string;
    carriedByCharacter: string | null;
    wornByCharacter: string | null;
}

declare type DEPosture =
    "standing" |
    "crawling" |
    "climbing" |
    "sitting" |
    "lying_down" |
    "lying_down+belly_up" |
    "lying_down+belly_down" |
    "on_all_fours" |
    "crouching" |
    "kneeling" |
    "hanging" |
    "floating" |
    "flying" |
    "swimming";

declare interface DEStateForCharacter {
    id: string;
    location: string;
    locationSlot: string;
    states: Array<DEApplyingState>;
    type: "INTERACTING" | "BACKGROUND";
    time: DETimeDescription;
    conversationId: string | null;
    /**
     * The message ID of the last message the character sent in the current conversation,
     * when this state was added
     */
    messageId: string | null;
    posture: DEPosture;
    carrying: DEItem[];
    carryingCharactersDirectly: Array<string>;
    wearing: DEItem[];
    /**
     * Indicates if the character is dead, aka its deadEnd was a death scenario
     */
    dead: boolean;
    /**
     * Indicates if the character has reached a dead end that results in their permanent removal from the story
     */
    deadEnded: boolean;
    /**
     * If the character has deadEnded, the reason why it happened
     */
    deadEndReason: string | null;
    /**
     * Items that have been seen when this state was active, reduced description
     * 
     * These can be subject to memory
     */
    seenItems: Array<DESeenItem>;
    /**
     * Characters that may have been seen when this state was active, reduced description
     * 
     * These can be subject to memory
     */
    seenCharacters: Array<string>;
}

declare interface DEStateForCharacterWithHistoricInformation extends DEStateForCharacter {
    surroundingNonStrangers: Array<string>;
    surroundingStrangers: Array<string>;
}

declare interface DEItemInteraction {
    /**
     * A question template to ask about the interaction, for example "did {{char}} open the chest?" or "did {{char}} eat the apple?"
     */
    action: DEStringTemplateCharOnly;
    /**
     * An effect template to describe the effect of the interaction, for example "the chest creaks open revealing a hidden treasure inside" or "the apple poisons {{char}}, causing them to feel sick"
     */
    effect: DEStringTemplateCharOnly;
    /**
     * States that it applied towards the character as a result of the interaction
     */
    appliedStates: Array<string>;
    /**
     * States that are applied to the surrounding characters
     */
    appliedStatesEverySurroundingCharacter: Array<string>;
}

declare interface DEStateForCharacterWithHistory extends DEStateForCharacter {
    history: Array<DEStateForCharacterWithHistoricInformation>;
}

declare interface DELocationSlot {
    description: DEStringTemplateCharOnly;
    /**
     * Maximum height in centimeters that can fit in this slot
     * will override location-based max height if specified
     */
    maxHeightCm?: number;
    /**
     * Maximum weight in kilograms that can fit in this slot
     * 
     * this will also be used to check how many people can fit at
     * once in the given slot
     */
    maxWeightKg: number;
    /**
     * Maximum volume in liters that can fit in this slot
     * will override location-based max volume if specified
     * 
     * this will also be used to check how many people can fit at
     * once in the given slot
     */
    maxVolumeLiters: number;
    /**
     * Names of weather systems that are fully blocked by this slot
     * will override location-based blocking if specified
     */
    slotFullyBlocksWeather?: Array<string>;
    /**
     * Names of weather systems that are only partially blocked by this slot
     * will override location-based blocking if specified
     */
    slotPartiallyBlocksWeather?: Array<string>;
    /**
     * Names of weather systems that affect this slot negatively
     * will override location-based negative effects if specified
     */
    slotNegativelyExposesCharactersToWeather?: Array<string>;
    /**
     * Items at this slot
     */
    items: Array<DEItem>;
    /**
     * Arbitrary properties at this slot
     */
    state: Record<string, any>;
    /**
     * Temporary properties to use during inference cycles, they do not persist
     */
    temp: Record<string, any>;
}

declare interface DEWeatherSystemApplyingStateWithIntensity {
    stateName: string;
    intensity: number;
}

declare interface DEWeatherSystem {
    /**
     * Name of the weather system, eg. "Rain", "Sunny", "Snow"
     */
    name: string;
    /**
     * The likelyhood of the weather system occurring in the world
     * an arbitrary number, a weather system with double this number will
     * be double as likely to occur
     */
    likelihood: number;
    /**
     * minimum duration of the weather system in hours
     */
    minDurationInHours: number;
    /**
     * Maximum duration of the weather system in hours
     */
    maxDurationInHours: number;
    /**
     * Description of the weather system's full effects on an unsheltered location
     * 
     * Note that you can add more nuance to the partial effect description by checking
     * the character's states, for example by having different partial effects if the character
     * is very light
     * 
     * eg. "{{#if (and (< (get_weight char) 20) (is_outdoors char))}}{{char}} is drenched by the relentless rain, shivering as the cold water soaks through their light clothing.{{else}}...{{/if}}"
     */
    fullEffectDescription: DEStringTemplateCharOnly;
    /**
     * Description of the weather system's partial effects on a partially sheltered location
     * 
     * Note that you can add more nuance to the partial effect description by checking
     * the character's states, for example by having different partial effects if the character
     * is very light
     * 
     * eg. "{{#if (and (< (get_weight char) 20) (is_outdoors char))}}{{char}} is drenched by the relentless rain, shivering as the cold water soaks through their light clothing.{{else}}...{{/if}}"
     */
    partialEffectDescription: DEStringTemplateCharOnly;
    /**
     * Description when there is no effect on a fully sheltered location
     */
    noEffectDescription: DEStringTemplateCharOnly;
    /**
     * Description of the weather system effects when it is having an extra negative effect on the character
     */
    negativelyExposedDescription: DEStringTemplateCharOnly;
    /**
     * If a character is in this state, they are fully protected from the weather system's effects
     * eg. "WEARING_RAINCOAT" "WEARING_FULL_BODY_ARMOR" "WEARING_SPACE_SUIT"
     */
    fullyProtectingStates: Array<string>;
    /**
     * If a character is in this state, they are fully protected from the weather system's effects
     * eg. "raincoat" "body armor" "space suit"
     */
    fullyProtectingWornItems: Array<string>;
    /**
     * If a character is carrying this item, they are fully protected from the weather system's effects
     * eg. "large umbrella" "full body shield"
     */
    fullyProtectingCarriedItems: Array<string>;
    /**
     * Whether being naked (no clothes or accessories at all) makes the character fully protected from the weather system's effects
     * I mean it could be very hot weather right? :D
     */
    fullyProtectedNaked: boolean;
    /**
     * Use this script to apply full custom logic to the character when fully exposed to the weather system
     * for example, if you want to apply damage over time, or other complex effects
     * 
     * This script will be called if it cannot determine the character is fully protected from the weather system's effects
     * as a fallback
     * 
     * You should return a string value indicating whether the script handled the full effect logic
     */
    fullyProtectedTemplate?: DEStringTemplateCharOnly | null;
    /**
     * If a character is in this state, they are partially protected from the weather system's effects
     * eg. "HOLDING_UMBRELLA" "WEARING_LIGHT_JACKET"
     */
    partiallyProtectingStates: Array<string>;
    /**
     * If a character is in this state, they are partially protected from the weather system's effects
     * eg. "light jacket"
     */
    partiallyProtectingWornItems: Array<string>;
    /**
     * If a character is carrying this item, they are partially protected from the weather system's effects
     * eg. "umbrella" "large shield"
     */
    partiallyProtectingCarriedItems: Array<string>;
    /**
     * Whether being naked (no clothes or accessories at all) makes the character partially protected from the weather system's effects
     */
    partiallyProtectedNaked: boolean;
    /**
     * Use this script to apply full custom logic to the character when partially exposed to the weather system
     * for example, if you want to apply damage over time, or other complex effects
     * 
     * This script will be called if it cannot determine the character is partially protected from the weather system's effects
     * as a fallback
     * 
     * You should return a string value indicating whether the script handled the full effect logic
     */
    partiallyProtectedTemplate?: DEStringTemplate | null;
    /**
     * If a character is in this state, they are negatively affected by the weather system's effects
     * eg. "SICK" "NAKED" "INJURED"
     */
    negativelyAffectingStates: Array<string>;
    /**
     * If a character is wearing this item, they are negatively affected by the weather system's effects
     * eg. "torn clothes" "light clothing"
     */
    negativelyAffectingWornItems: Array<string>;
    /**
     * If a character is carrying this item, they are negatively affected by the weather system's effects
     * eg. "leaking container" "fragile equipment"
     */
    negativelyAffectingCarriedItems: Array<string>;
    /**
     * Whether being naked (no clothes or accessories at all) makes the character negatively affected by the weather system's effects
     */
    negativelyAffectedNaked: boolean;
    /**
     * Use this script to apply full custom logic to the character when negatively affected by the weather system
     * 
     * This script will be called if it cannot determine the character is negatively affected by the weather system's effects
     * as a fallback
     * 
     * You should return a string value indicating whether the script handled the negative effect logic
     */
    negativelyAffectedTemplate?: DEStringTemplate | null;
    /**
     * Names of states that are applied to characters while they are fully exposed to the weather system
     * eg. "WET" for rain, "SUNBURNED" for sunny weather
     */
    applyingStatesDuringFullEffect: Array<DEWeatherSystemApplyingStateWithIntensity>;
    /**
     * Names of states that are applied to characters while they are partially exposed to the weather system
     * eg. "SLIGHTLY_WET" for rain, "SLIGHTLY_SUNBURNED" for sunny weather
     */
    applyingStatesDuringPartialEffect: Array<DEWeatherSystemApplyingStateWithIntensity>;
    /**
     * Names of states that are applied to characters while they are not exposed to the weather system
     * and fully sheltered from it
     */
    applyingStatesDuringNoEffect: Array<DEWeatherSystemApplyingStateWithIntensity>;
    /**
     * Names of states that are added if they are in a negative effect state and exposed to the weather system
     */
    applyingStatesDuringNegativeEffect: Array<DEWeatherSystemApplyingStateWithIntensity>;
    /**
     * Whether to apply the states in the order they are listed in the arrays above along the duration of exposure
     * or to apply them all at once on contact with the weather system
     */
    applyStatesInOrder: boolean;
}

// TODO
declare interface DEUnlockCondition {
    /**
     * Description of the unlock condition, this will be inferenced with llm
     * eg. {{char}} inputs the code "1234" into the keypad
     */
    opensIf: DEStringTemplateCharOnly;
    /**
     * Mostly meant for the user to check if the condition is met
     * eg. has {{char}} input "1234" into the keypad?
     * The answer should be yes for the condition to be considered met
     * and the entrance to be unlocked
     */
    yesNoQuestion: DEStringTemplateCharOnly;
}

// TODO
declare interface DEEntrances {
    /**
     * Name of the entrance, eg. "front door", "keypad door", "bridge", "garage door"
     */
    name: string;
    /**
     * Description of the entrance
     */
    description: DEStringTemplateVoid;
    /**
     * Maximum height in centimeters that can fit through this entrance
     */
    maxHeightCm: number;
    /**
     * Maximum weight in kilograms that can fit through this entrance
     */
    maxWeightKg: number;
    /**
     * Maximum volume in liters that can fit through this entrance
     */
    maxVolumeLiters: number;
    /**
     * Whether the entrance is currently locked or not
     */
    isCurrentlyLocked: boolean;
    /**
     * Whether sounds can be heard from inside to outside and viceversa
     */
    canHearFromInsideOutside: boolean;
    /**
     * Whether the entrance can be unlocked from the inside without any requirements
     * eg. some doors can just be opened from the inside without a key or code
     */
    canBeUnlockedFromInsideWithoutRequirements: boolean;
    /**
     * Use this for specifying other unlock conditions like keypads, biometric scanners, etc.
     * Even locksmithing attempts, these would be yes/no questions that would be inferred to determine
     * if a character succeeded in unlocking the entrance
     */
    otherUnlockConditions: Array<DEUnlockCondition>;
    /**
     * Names of characters that can unlock this entrance regardless of other conditions
     * eg. the door may be primed to open by certain characters only
     */
    canBeUnlockedByCharacters: Array<string>;
    /**
     * Names of items that can unlock this entrance regardless of other conditions
     * eg. keys, keycards, etc.
     */
    canBeUnlockedByWithItems: Array<string>;
    /**
     * Whether the entrance automatically locks itself when interacted, as in characters
     * pass through and then it locks itself again
     * 
     * Useful for security doors and doors that should not be left open, otherwise intruders
     * could just walk in after someone else opened the door and forgot to close it
     */
    autoLocks: boolean;
}

declare interface DELocationDefinition {
    /**
     * Description of the location
     */
    description: DEStringTemplateCharOnly;
    /**
     * Type of vehicle the location is, yes a location can be a vehicle too
     * eg. "car", "spaceship", "boat", etc...
     */
    vehicleType?: string;
    /**
     * Volume in liters of the vehicle for location that are vehicles
     */
    vehicleVolumeLiters?: number;
    /**
     * Weight in kilograms of the vehicle for location that are vehicles
     */
    vehicleWeightKg?: number;
    /**
     * Height in centimeters of the vehicle for location that are vehicles
     */
    vehicleHeightCm?: number;
    /**
     * Range in meters of the vehicle for location that are vehicles, this
     * is what allows vehicles to travel between locations that would otherwise
     * be unreachable
     */
    vehicleRangeMeters?: number;
    /**
     * Speed in meters per second of the vehicle for locations that are vehicles
     * this means you have a travel time when moving between locations using this vehicle
     * in which you cannot exit the vehicle until the travel time is over
     */
    vehicleSpeedMetersPerSecond?: number;
    /**
     * Whether the location is considered safe for characters
     * for example, a home is usually safe, while a dark alley is not
     */
    isSafe: boolean;
    /**
     * Whether the location is considered private,
     * often that means only a few characters have access to it at once or it can be locked
     * eg. a bedroom is usually private, while a park is not
     */
    isPrivate: boolean;
    /**
     * Whether the location is indoors or outdoors
     */
    isIndoors: boolean;
    /**
     * Maximum height in centimeters that can fit in this location
     */
    maxHeightCm: number;
    /**
     * Maximum weight in kilograms that can fit in this location
     */
    maxWeightKg: number;
    /**
     * Maximum volume in liters that can fit in this location
     */
    maxVolumeLiters: number;
    /**
     * Arbitrary properties of the location that can be used for various purposes
     * eg. "has_fireplace": true, "number_of_windows": 3, etc...
     */
    state: Record<string, any>;
    /**
     * Temporary properties to use during inference cycles, they do not persist
     */
    temp: Record<string, any>;
    /**
     * The parent location ID, null if none, this means that the location is inside another location
     * for example, a bedroom is inside a house, so the bedroom's parent would be the house location ID
     * and if the house has a city location as parent, the bedroom's grandparent would be the city location ID
     * they will share the same weather unless the child location has its own weather system
     * 
     * This is also how vehicles move, as they are locations and their parent location is the location they are currently in
     * for example, a car location's parent could be a garage location, and when the car moves, its parent location changes to the road location, etc...
     */
    parent: string | null;
    /**
     * The entrances to this location
     * for example, "front_door", "keypad", "garage_door", etc.
     * these also become interactable location slots, and can have locks
     */
    entrances: Array<DEEntrances>;
    /**
     * Slots within the location where people can move and interact with the things in the location
     */
    slots: Record<string, DELocationSlot>;
    /**
     * Names of weather systems that are fully blocked by this location
     * this will be overridden by slot-based blocking
     */
    locationFullyBlocksWeather: Array<string>;
    /**
     * Names of weather systems that are only partially blocked by this location
     * this will be overridden by slot-based blocking
     */
    locationPartiallyBlocksWeather: Array<string>;
    /**
     * Names of weather systems that negatively expose characters to the weather effects
     * And put them into a negative effect state
     */
    locationNegativelyExposesCharactersToWeather: Array<string>;
    /**
     * Weather systems that only affect this location, if not specified the parent location
     * weather systems will apply here too
     */
    ownWeatherSystem: Array<DEWeatherSystem> | null;
    /**
     * Names of the characters that are spawned in this location with instantiable names
     * child connections will inherit these names
     * 
     * This is useful when creating characters dinamically as a template, using the templating system; since
     * each character needs a unique name, the location can provide a name pool to draw from, this is useful
     * for example if you have different countries and each country has its own set of common names
     * eg. a location representing Japan may have a name pool with Japanese names, while a location
     * representing Finland may have a name pool with Finnish names
     * 
     * There is a default name pool at the world level that applies to all locations that do not have their own name pool
     * if a location has its own name pool, it will override the world name pool for characters spawned in that location, it will
     * go from parent to parent until it finds a name pool
     * 
     * The name pool should not use last names by default because the LLM can get confused with two characters having the same first or last name
     * so it is recommended to use first names only, unless you have a very specific reason to use last names too
     */
    namePool?: DENamePool;
}

declare interface DEConnection {
    /**
     * Source location ID
     */
    from: string;
    /**
     * Destination location ID
     */
    to: string;
    /**
     * Maximum height capacity in centimeters for vehicles or characters using this connection
     */
    maxHeightCm: number;
    /**
     * Maximum weight capacity in kilograms for vehicles or characters using this connection
     */
    maxWeightKg: number;
    /**
     * Maximum volume capacity in liters for vehicles or characters using this connection
     */
    maxVolumeLiters: number;
    /**
     * Whether only vehicles can use this connection
     */
    onlyVehicles: boolean;
    /**
     * Types of vehicles that can use this connection
     */
    vehicleTypes: Array<string>;
    /**
     * Whether the connection is bidirectional or not
     */
    bidirectional: boolean;
    /**
     * Distance in meters between the two locations connected
     * this is used for travel time calculations
     */
    distanceMeters: number;
    /**
     * Conditions that must be met to allow passage through this connection
     * Using inference to determine if the conditions are met
     * eg. "{{char}} must be capable of flying or be carried by a flying character to pass through this connection"
     */
    otherPassageConditions: Record<string, DEStringTemplate>;
    /**
     * Arbitrary properties of the connection that can be used for various purposes
     */
    state: Record<string, any>;
    /**
     * Temporary properties to use during inference cycles, they do not persist
     */
    temp: Record<string, any>;
}

declare interface DEStatefulLocationDefinition extends DELocationDefinition {
    /**
     * Arbitrary properties of the location that can be used for various purposes
     */
    state: Record<string, any>;

    internalState: {
        // STATEFUL PROPERTIES
        /**
         * The current weather system affecting this location
         * children of this location will have the same weather unless they have their own weather system
         */
        currentWeather: string;
        /**
         * How long the current weather has been ongoing for
         */
        currentWeatherHasBeenOngoingFor: DETimeDurationDescription;
        /**
         * Either the location-specific full effect description or the general weather full effect description
         */
        currentWeatherFullEffectDescription: DEStringTemplateCharOnly;
        /**
         * Either the location-specific partial effect description or the general weather partial effect description
         */
        currentWeatherPartialEffectDescription: DEStringTemplateCharOnly;
        /**
         * Either the location-specific no effect description or the general weather no effect description
         */
        currentWeatherNoEffectDescription: DEStringTemplateCharOnly;
        /**
         * Either the location-specific negative effect description or the general weather negative effect description
         */
        currentWeatherNegativelyExposedDescription: DEStringTemplateCharOnly;
    }
}

declare interface DEConversationMessage {
    /**
     * Id of the message
     */
    id: Readonly<string>;
    /**
     * Who sent this message
     */
    sender: string;
    /**
     * Whether the sender is a character
     * this is also true for the user since the user is a character too
     */
    isCharacter: boolean;
    /**
     * Whether the sender is the user
     */
    isUser: boolean;
    /**
     * Whether the message was rejected by world rules or other constraints
     * and thus not actually sent
     * 
     * Basically only applies to users when they have break the rules so they can see their rejected
     * message
     */
    isRejectedMessage: boolean;
    /**
     * Whether the message is a system message, eg. narration, scene description, etc.
     */
    isStoryMasterMessage: boolean;
    /**
     * Whether the message is a debug message, eg. internal engine messages not meant to be seen by characters
     * or the user
     * 
     * They can be seen if the character or user is in debug mode, they basically represent the commands
     * eg /whocanisee etc... and other internal messages that are used for debugging purposes
     */
    isDebugMessage: boolean;
    /**
     * Hidden messages are messages that are basically exclusively used to be seen only by that character
     * but not form part of the story, therefore do not account for inference ever
     * 
     * Hidden messages are basically used to tell user that a state has been applied to that character,
     * eg. "you have been mind controlled" but other characters are not aware of that
     * 
     * This is the only way to communicate mind states to the user without other characters being aware of it,
     * since states are by definition hidden from other characters, as they represent the character's internal monologue and private thoughts
     */
    isHiddenMessage: boolean;
    /**
     * The content of the message
     */
    content: string;
    /**
     * Hidden content, metadata, etc...
     */
    hiddenContent?: string;
    /**
     * The time when the message was sent
     */
    startTime: DETimeDescription;
    /**
     * The duration of time it took to do what the message describes
     * in game time
     */
    duration: DETimeDurationDescription;
    /**
     * The time when the message action ended
     */
    endTime: DETimeDescription;
    /**
     * If the message can only be seen by a specific character, their Name
     * eg. for private thoughts, state changes, or secret messages; basically representing the character's internal monologue
     * Also true for schizophrenic characters that hear voices that no one else can hear
     * 
     * if null, the message can be seen by all participants in the conversation
     */
    canOnlyBeSeenByCharacter: string | null;

    /**
     * A very short summary of this same message, this is used because the LLM has a hard time keeping track
     * of long conversations, so this summary kicks in to keep the context window short
     */
    singleSummary: string | null;

    /**
     * The collective summaries of this message in layers
     * where the first item represents a summary of say, a collection of 10 messages, the second
     * 100 messages, the third 1000 messages, etc... this is used to keep the context window short for long conversations
     * 
     * The summary size used is created using the exponentialSummaryScale property
     * 
     * Summaries are available at "summaries" property on the DE object
     */
    perspectiveSummaryIds: {
        [characterName: string]: Array<string>;
    };

    /**
     * The emotion of the message, this is used to add more nuance to the message and help the LLM understand the tone of the message
     */
    emotion: DEEmotionNames | null;

    /**
     * The emotional range of the message
     */
    emotionalRange: DEEmotionNames[] | null;
    /**
     * The characters that are known to be interacting in the message
     */
    interactingCharacters: Array<string>;
    /**
     * Rumors the character learned in the conversation
     * TODO
     */
    rumors: Array<DERumor>;
}

// TODO
declare interface DEImportantEvent {
    /**
     * The id of the important event, should be totally unique
     */
    id: string;
    /**
     * The magnitude of the important event or rumor, this is an arbitrary number that represents how big or impactful the event is, it can be used to determine how likely it is to spread, how much it affects characters' beliefs, etc...
     */
    magnitude: number;
    /**
     * The description of the event or rumor
     */
    description: string;
    /**
     * A fuzzy description of the important event or rumor that applies
     * to characters too many layers away to know the full details
     */
    fuzzyDescription: string;
    /**
     * The time when the event happened, this is used to determine how recent the event is, how likely it is to be forgotten, etc...
     */
    eventTime: DETimeDescription;
    /**
     * The characters that are known to be involved in the important event
     */
    participants: Array<string>;
}

// TODO
declare interface DERumor {
    /**
     * The id of the important event that the rumor is about
     */
    eventId: string;
    /**
     * How many layers of separation the character is from the source of the rumor, this is an arbitrary number that represents how many degrees of separation there are between the character and the source of the rumor, it can be used to determine how reliable the rumor is, for example, a rumor that is only one layer away from the character is more likely to be true than a rumor that is three layers away
     */
    layers: number;
    /**
     * Who this character got the rumor from, this can be used to determine the reliability of the rumor
     * if no character specified the rumor was obtained firsthand
     */
    source: string | null;
}

/**
 * Note that a conversation doesn't really have to be about speaking, it can be any kind of interaction
 * between characters, including non-verbal interactions, actions, etc...
 * 
 * A conversation is simply a record of an interaction that happened between characters
 * it can include messages, actions, etc...
 */
declare interface DEConversation {
    /**
     * The unique ID of the conversation
     */
    id: Readonly<string>;
    /**
     * The list of participants of the conversation
     * The participants of a given conversation never change, each conversation is unique to its participants
     * if a new participant joins, a new conversation is created including the new participants
     */
    participants: Array<string>;
    /**
     * List of the remote participants in the conversation
     * these are participants that are not physically present in the same location as the other participants
     * for example, if two characters are talking on the phone
     */
    remoteParticipants: Array<string>;
    /**
     * The previous conversation IDs for each participant before this conversation started
     * This basically specifies the chain of conversations that led to this one
     * for each participant individually
     */
    previousConversationIdsPerParticipant: Record<string, string | null>;
    /**
     * The location where the conversation is happening
     */
    location: string;
    /**
     * The start time of the conversation
     */
    startTime: DETimeDescription;
    /**
     * The list of messages that were exchanged in the conversation
     */
    messages: Array<DEConversationMessage>;
    /**
     * Whether this conversation is a pseudo-conversation,
     * i.e., not an actual interactive conversation but an interaction
     * that ocurred between two characters without the user participating directly
     * hence no messages are recorded just some summary information
     */
    pseudoConversation: boolean;
    /**
     * The bonds at the start and end of the conversation for each participant
     * towards each other participant this allows to track how bonds evolved during the conversation
     */
    bondsAtStart: Record<string, DEBondDescription>;
    /**
     * The bonds at the start and end of the conversation for each participant
     * towards each other participant this allows to track how bonds evolved during the conversation
     */
    bondsAtEnd: Record<string, DEBondDescription> | null;
    /**
     * An short summary of a pseudo conversation and what happened in it
     * 
     * if one is not found, the LLM will be prompted to generate one
     * randomly, or whatever is set as the pseudoConversation generator in the world scripts
     * 
     * Generating summaries can be costly in terms of tokens, so it is recommended to
     * set up a pseudoConversation generator script that generates summaries
     * as part of the world scripts after each pseudo-conversation ends
     * to avoid having to generate them on demand later
     */
    pseudoConversationSummary?: string | null;
}

declare interface DEStringTemplateInfoCharOnly {
    /**
     * Available the character invoking the template
     * Usually available, but in rare cases like in narration
     * it may not be
     */
    char: DECompleteCharacterReference,
}
declare interface DEStringTemplateInfoCharAndOther {
    /**
     * Available the character invoking the template
     * Usually available, but in rare cases like in narration
     * it may not be
     */
    char: DECompleteCharacterReference,

    /**
     * Only available in bond description templates
     */
    other: DECompleteCharacterReference,
    /**
     * The relationship that the bond description has, usually this is for family only
     * as it otherwise defaults to "friend" for positive bond or "foe" for negative
     */
    otherFamilyRelation: DEFamilyRelation | null,
    /**
     * The relationship with the other
     */
    otherRelationship: string | null,
}

declare interface DEStringTemplateInfoCharAndItem {
    /**
     * Available the character invoking the template
     * Usually available, but in rare cases like in narration
     * it may not be
     */
    char: DECompleteCharacterReference,

    /**
     * Only available in a special utility
     */
    item: string,
}

declare interface DEStringTemplateInfoCharAndCauses {
    /**
     * Available the character invoking the template
     * Usually available, but in rare cases like in narration
     * it may not be
     */
    char: DECompleteCharacterReference,

    /**
     * Only available in state description templates, these are the causes and causants of a given state
     */
    causes: DEStateCause[] | null,
}

declare interface DEStringTemplateInfoManyChars {
    /**
     * Only available in likes and dislikes description templates
     */
    chars?: DECompleteCharacterReference[],
}

declare type DEStringTemplateCharOnly = string | ((
    /**
     * Always available the DE object representing the whole simulation
     */
    DE: DEObject,
    info: DEStringTemplateInfoCharOnly
) => Promise<string> | string);

declare type DEStringTemplateCharAndOther = string | ((
    /**
     * Always available the DE object representing the whole simulation
     * this is useful for checking the current state of the world, the characters, etc... to generate dynamic descriptions based on the current situation
     */
    DE: DEObject,
    info: DEStringTemplateInfoCharAndOther
) => Promise<string> | string);

declare type DEStringTemplateCharAndItem = string | ((
    /**
     * Always available the DE object representing the whole simulation
     * this is useful for checking the current state of the world, the characters, etc... to generate dynamic descriptions based on the current situation
     */
    DE: DEObject,
    info: DEStringTemplateInfoCharAndItem
) => Promise<string> | string);

declare type DEStringTemplateCharAndCauses = string | ((
    /**
     * Always available the DE object representing the whole simulation
     *  this is useful for checking the current state of the world, the characters, etc... to generate dynamic descriptions based on the current situation
     */
    DE: DEObject,
    info: DEStringTemplateInfoCharAndCauses
) => Promise<string> | string);

declare type DEStringTemplateManyChars = string | ((
    /**
     * Always available the DE object representing the whole simulation
     * this is useful for checking the current state of the world, the characters, etc... to generate dynamic descriptions based on the current situation
     */
    DE: DEObject,
    info: DEStringTemplateInfoManyChars
) => Promise<string> | string);

declare interface DEScene {
    /**
     * The starting location ID for the initial scene
     */
    location: string;
    /**
     * The starting location slot within the starting location
     */
    locationSlot: string;
    /**
     * The narration that sets up the initial scene
     */
    narration: DEStringTemplateCharOnly;
    /**
     * Characters that will be engaged with the user at the start of the scene
     * these characters will be in a conversation with the user right away
     * make sure that the characters are spawned in the location with the user
     * otherwise they won't be able to interact
     */
    engagedCharacters: Array<string>;
    /**
     * Whether the characters will interact first in the cycle, rather than the user
     * this is useful for scenes where the characters start by talking rather than
     * the user starting the interaction
     */
    charactersStart: boolean;
    /**
     * The initial time when the scene starts
     * it must be a date in the future, otherwise it will be ignored
     */
    time?: DETimeDescription | null;
    /**
     * Prepare the scene, modify any attributes as necessary
     * 
     * [prepareScene]
     * (characters are moved to the location, and the line of interaction prepared)
     * (first story master message about the scene)
     * [sceneStarted]
     * (items, states, bond, etc... updated)
     * (characters interact)
     * [sceneReady]
     * 
     * @param DE The DEObject representing the current state of the world
     * @param scene The DEScene object representing the scene being prepared, you can modify this object to change the scene setup as needed
     * @returns A promise that resolves to a DEScene object with the prepared scene, this allows for dynamic scene preparation based on the current state of the world
     */
    prepareScene?(DE: DEObject, scene: DEScene): Promise<DEScene | void | null>;
    /**
     * Called when the scene has started, allowing for any additional setup or actions to be performed right after the scene starts
     * 
     * [prepareScene]
     * (characters are moved to the location, and the line of interaction prepared)
     * (first story master message about the scene)
     * [sceneStarted]
     * (items, states, bond, etc... updated)
     * (characters interact)
     * [sceneReady]
     * 
     * @param DE 
     */
    sceneStarted?(DE: DEObject, scene: DEScene): Promise<void>;
    /**
     * After the scene has started and is ready for user input
     * 
     * [prepareScene]
     * (characters are moved to the location, and the line of interaction prepared)
     * (first story master message about the scene)
     * [sceneStarted]
     * (items, states, bond, etc... updated)
     * (characters interact)
     * [sceneReady]
     * 
     * @param DE 
     */
    sceneReady?(DE: DEObject, scene: DEScene): Promise<void>;
}

declare interface DEWorld {
    /**
     * The current location ID where the user is located
     * while the user is a character too for optimization reasons this
     * location is where things happen because the user observes from there
     */
    currentLocation: string;
    /**
     * The current location slot where the user is located
     * while the user is a character too for optimization reasons this
     * location is where things happen because the user observes from there
     */
    currentLocationSlot: string;
    /**
     * The selected scene id that was selected as the initial scene
     * for the world at the beginning of the simulation
     */
    selectedScene: string | null;
    /**
     * All the locations in the world with their current state
     */
    locations: Record<string, DEStatefulLocationDefinition>;
    /**
     * The connections between locations in the world
     */
    connections: Record<string, DEConnection>;
    /**
     * Scenes that set up the world, specially at the start of the simulation
     */
    scenes: Record<string, DEScene>;
    /**
     * The initial scenes that can be selected at the start of the simulation, id only
     */
    initialScenes: string[];
    /**
     * This is a template that describes the overall world lore and setting
     * it gets injected into various prompts to help ground the world simulation
     * it is also used by characters to understand the world they are in
     * and detect lies or inconsistencies
     */
    lore: DEStringTemplate | null;
    /**
     * Properties of the world that can be used for various purposes, eg. "world_age": 1000, "technology_level": "medieval", "has_magic": true, etc...
     */
    state: Record<string, any>;
    /**
     * Temporary properties to use during inference cycles, they do not persist
     */
    temp: Record<string, any>;
}

declare interface DENarrationStyle {
    /**
     * A number from 0 to 1 that represents how often the world will narrate only instead
     * of making the character talk, this is a random
     * Default 0.2
     * 
     * This mostly affects narration as after dialogue narration always comes
     * 
     * A dialogue is guaranteed to appear unless the character has a mute vocabulary
     * this bias is not a perfect random roll
     * 
     * Keep it low, it actually causes a lot of narration
     */
    narrativeBias: number;
    /**
     * The minimum number of paragraphs to generate when narrating, either dialogue or narration
     */
    minParagraphs: number;
    /**
     * The maximum number of paragraphs to generate when narrating, either dialogue or narration
     */
    maxParagraphs: number;
}

declare interface DEUtils {
    newLocation(DE: DEObject, name: string, definition: DELocationDefinition): DELocationDefinition;
    newCharacter(DE: DEObject, definition: DECompleteCharacterReference): DECompleteCharacterReference;
    newConnection(DE: DEObject, definition: DEConnection): DEConnection;
    createStateInAllCharacters(DE: DEObject, stateName: string, stateDefinition: DECharacterStateDefinition): DECharacterStateDefinition;
    defineStateInCharacter(DE: DEObject, character: string | DECompleteCharacterReference | null, stateName: string, stateDefinition: DECharacterStateDefinition): DECharacterStateDefinition | null;
    newBond(DE: DEObject, char1: string | DECompleteCharacterReference | null, towards: string | DECompleteCharacterReference | null, bondDefinition: Omit<DESingleBondDescription, "towards">, options?: { forceOverride: boolean }): DESingleBondDescription | null;
    newMutualBond(DE: DEObject, char1: string | DECompleteCharacterReference | null, char2: string | DECompleteCharacterReference | null, bondDefinition: Omit<DESingleBondDescription, "towards">): [DESingleBondDescription | null, DESingleBondDescription | null];
    newFamilyRelation(DE: DEObject, char1: string | DECompleteCharacterReference | null, towards: string | DECompleteCharacterReference | null, relation: DEFamilyRelation): [DEFamilyTie | null, DEFamilyTie | null];
    newGlobalInterest(DE: DEObject, interest: DECharacterInterest);

    isStrangerTowards(DE: DEObject, char1: string | DECompleteCharacterReference | null, char2: string | DECompleteCharacterReference | null): boolean;
    isAttractedTo(DE: DEObject, char1: string | DECompleteCharacterReference | null, potentialAttractiveChar2: string | DECompleteCharacterReference | null): boolean;
    isAttractedToWithLevel(DE: DEObject, char1: string | DECompleteCharacterReference | null, potentialAttractiveChar2: string | DECompleteCharacterReference | null): "slight" | "moderate" | "strong" | false;
    isAttractedToWithLevelAsNumber(DE: DEObject, char1: string | DECompleteCharacterReference | null, potentialAttractiveChar2: string | DECompleteCharacterReference | null): number;
    isAttractedToWithReasoning(DE: DEObject, char1: string | DECompleteCharacterReference | null, potentialAttractiveChar2: string | DECompleteCharacterReference | null): { attracted: boolean, reasoning: string, level: "slight" | "moderate" | "strong" | false };

    /**
     * To be used during questions and triggers mostly
     */
    shiftBond(DE: DEObject, char1: string | DECompleteCharacterReference | null, towards: string | DECompleteCharacterReference | null, primaryShift: number, secondaryShift: number): void;
    /**
     * Whether the bond has already been shifted this cycle
     */
    hasBondBeenShiftedThisCycle(DE: DEObject, char1: string | DECompleteCharacterReference | null, towards: string | DECompleteCharacterReference | null): boolean;
    /**
     * Shifts the state of a character by a certain amount
     * To be used during questions and triggers mostly
     */
    shiftState(DE: DEObject, character: string | DECompleteCharacterReference | null, stateName: string, shift: number, cap: number | null, causes: DEStateCause[] | null): void;
    /**
     * Adds a cause to a character state, this is used to keep track of what caused a state to be applied
     */
    addCauseToState(DE: DEObject, character: string | DECompleteCharacterReference | null, stateName: string, cause: DEStateCause): void;
    /**
     * Removes a cause from a character state, this is used to keep track of what caused a state to be applied
     */
    removeCauseFromState(DE: DEObject, character: string | DECompleteCharacterReference | null, stateName: string, cause: DEStateCause): void;
    removeCausantFromState(DE: DEObject, character: string | DECompleteCharacterReference | null, stateName: string, causant: string, causantType: "character" | "object"): void;
    /**
     * To be used during questions and triggers mostly
     * 
     * Will trigger that action once the character is to talk
     */
    triggerActionNext(DE: DEObject, action: DEActionPromptInjection): void;
    accumulateInCharacter(DE: DEObject, character: string | DECompleteCharacterReference, accumulatorName: string, amount: number): number;
    getAccumulatedValueInCharacter(DE: DEObject, character: string | DECompleteCharacterReference, accumulatorName: string): number;

    newTrigger(DE: DEObject, character: string | DECompleteCharacterReference, trigger: DECharacterYesNoQuestion | DECharacterNumericQuestion | DECharacterTextQuestion): void;
    newTriggerInAllCharacters(DE: DEObject, trigger: DECharacterYesNoQuestion | DECharacterNumericQuestion | DECharacterTextQuestion): void;

    charHasState(DE: DEObject, character: string | DECompleteCharacterReference, stateName: string): boolean;
    charIsRelievingState(DE: DEObject, character: string | DECompleteCharacterReference, stateName: string): boolean;

    /**
     * Causes any bond intimacy types check to not run, say if they are in some form of conflicting state
     * reducing a bond will also cause this effect
     * 
     * @param DE 
     * @param char1 
     * @param towards 
     */
    rejectIntimacy(DE: DEObject, char1: string | DECompleteCharacterReference | null, towards: string | DECompleteCharacterReference | null): void;

    templateUtils: {
        /**
         * Returns a DEStringTemplateCharAndCauses that is broken down into causants and causes
         * 
         * For example, say the state is "Angry"
         * 
         * By default the LLM will inject the following phrase into the template:
         * 
         * `{{char}} is very Angry` (or whatever the intensity is)
         * 
         * Then it will inject the template, this will simply do the following:
         * 
         * {{base}}
         * 
         * causes:
         * [perOther]
         * perOther cause: {{cause}}
         * [/perOther]
         * 
         * [perItem]
         * perItem cause: {{cause}}
         * [/perItem]
         * 
         * @param DE 
         * @param param1 
         */
        breakDownCharactersAndCausesTemplate(DE: DEObject, info: {
            /**
             * A template on how the character acts in general
             */
            base: DEStringTemplateCharOnly,
            /**
             * A template on how the character will act towards a specific character
             * that caused that given state, the reason why that charater will be added at the end of the sentence
             */
            perOther: DEStringTemplateCharAndOther,
            /**
             * A template on how the character will act towards an object that caused that
             * given state
             */
            perObject: DEStringTemplateCharAndItem,
        }): DEStringTemplateCharAndCauses;
        /**
         * The list of all characters available in the world, including the user
         * @returns eg. [Arya, Thalon, Mira, Dorian, Luna, Kiro]
         */
        allWorldCharacters(DE: DEObject): DECompleteCharacterReference[];
        /**
         * The list of all characters available in the world, excluding the user
         * @returns eg. [Arya, Thalon, Mira, Dorian, Luna, Kiro]
         */
        allWorldCharactersButUser(DE: DEObject): DECompleteCharacterReference[];
        /**
         * The name of the character current location
         * @returns eg. Eldoria, Shadowfen
         */
        currentLocation(DE: DEObject): string;
        /**
         * Boolean indicating if character is in a vehicle at the current location
         * @returns true or false
         */
        currentLocationIsInVehicle(DE: DEObject): boolean;
        /**
         * Boolean indicating if the character is in a safe location at the current location
         * @returns true or false
         */
        currentLocationIsSafe(DE: DEObject): boolean;
        /**
         * The list of all characters available in the current location of the world, including the user
         * @returns eg. [Luna, Kiro]
         */
        allCharactersAtLocation(DE: DEObject, locationName: string): DECompleteCharacterReference[];
        /**
         * Boolean indicating if the provided location is a vehicle
         * @returns true or false
         */
        locationIsVehicle(DE: DEObject, locationName: string): boolean;
        /**
         * Boolean indicating if the provided location is a safe location
         * @returns true or false
         */
        locationIsSafe(DE: DEObject, locationName: string): boolean;
        /**
         * TODO does this work?
         * The name of the characters/users/objects that activated the state last
         * @returns eg. ["Aria", "Thalon", "Player", "The Ancient Sword"]
         */
        getLastStateCausants(DE: DEObject, char: DECompleteCharacterReference, stateName: string): string[];
        /**
         * TODO does this work?
         * The name of the characters only that activated the state last
         * @returns eg. ["Aria", "Thalon", "Player"]
         */
        getLastStateCharacterCausants(DE: DEObject, char: DECompleteCharacterReference, stateName: string): string[];
        /**
         * TODO does this work?
         * The name of the characters only that activated the state last
         * @returns eg. ["Aria", "Thalon", "Player"]
         */
        getLastStateObjectCausants(DE: DEObject, char: DECompleteCharacterReference, stateName: string): string[];
        /**
         * Get the list of active states for the current character
         * @returns eg. [ANGRY, TIRED, HAPPY]
         */
        getStates(DE: DEObject, char: DECompleteCharacterReference): string[];
        /**
         * Get the intensity of the specified active state for the current character, intensities are integer numbers from 0 to 4
         * @returns eg. 0, 1, 2, 3, 4
         */
        getStateIntensity(DE: DEObject, char: DECompleteCharacterReference, stateName: string): number;
        /**
         * Check if the current character has the specified active state
         * @returns eg. true or false
         */
        hasState(DE: DEObject, char: DECompleteCharacterReference, stateName: string): boolean;
        /**
         * Check if the current character has just activated the specified state in this interaction
         * @returns eg. true or false
         */
        stateHasJustActivated(DE: DEObject, char: DECompleteCharacterReference, stateName: string): boolean;
        /**
         * Get how many inference cycles ago the state was activated for the provided character
         * @returns eg. 3, it will return -1 if the state is not found ever
         */
        getStateActivationCyclesAgo(DE: DEObject, char: DECompleteCharacterReference, stateName: string): number;
        /**
         * Get the list of social group members for the current character
         * @returns eg. [Arya, Thalon, Mira]
         */
        getSocialGroup(DE: DEObject, char: DECompleteCharacterReference, minBondLevel: number, maxBondLevel: number, min2BondLevel: number, max2BondLevel: number): string[];
        /**
         * Get the list of social group members for the current character that are present at the same location as our character
         * @returns eg. [Arya, Thalon, Mira]
         */
        getPresentSocialGroup(DE: DEObject, char: DECompleteCharacterReference, minBondLevel: number, maxBondLevel: number, min2BondLevel: number, max2BondLevel: number): string[];
        /**
         * Get the list of social group members for the current character, that are not only present but also in a conversation with our character
         * @returns eg. [Thalon, Mira]
         */
        getPresentConversingSocialGroup(DE: DEObject, char: DECompleteCharacterReference, minBondLevel: number, maxBondLevel: number, min2BondLevel: number, max2BondLevel: number): string[];
        /**
         * Get the difference between the provided list and the present social group members
         * @returns eg. [Arya, Thalon]
         */
        getDifferenceOfPresentSocialGroup(DE: DEObject, char: DECompleteCharacterReference, list: string[]): string[];
        /**
         * Get the list of social group members that are gone forever (most likely dead) for the current character
         * @returns eg. [Thalon, Mira]
         */
        getExSocialGroup(DE: DEObject, char: DECompleteCharacterReference, minBondLevel: number, maxBondLevel: number, min2BondLevel: number, max2BondLevel: number): string[];
        /**
         * Get the currently carrying weight of the character
         * @returns eg. 70
         */
        getCarryWeight(DE: DEObject, char: DECompleteCharacterReference): number;
        /**
         * Get the currently carrying volume of the character
         * @returns eg. 70
         */
        getCarryVolume(DE: DEObject, char: DECompleteCharacterReference): number;
        /**
         * Get the power level of the specified character, a number that can be used to compare the strength of characters in a very general way
         * @returns eg. 50
         */
        getPowerLevel(DE: DEObject, char: DECompleteCharacterReference): number;
        /**
         * Get the tier of the specified character, representing their overall power level
         * @returns eg. human
         */
        getTier(DE: DEObject, char: DECompleteCharacterReference): string;
        /**
         * Get the numeric value of the specified character's tier, representing their power level within the tier
         * @returns eg. 85
         */
        getTierValue(DE: DEObject, char: DECompleteCharacterReference): number;
        /**
         * Boolean indicating if the character is dead
         * @returns true or false
         */
        isDead(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the string given is a character, this will give true to the user as well
         * @returns true or false
         */
        getChar(DE: DEObject, potentialCharacter: string): DECompleteCharacterReference | null;
        /**
         * Boolean indicating if the character is the user
         * @returns true or false
         */
        isUser(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character is a present member of the social
         * @returns true or false
         */
        isPresentMember(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character is not present in the location
         * @returns true or false
         */
        isNotPresent(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character is gone forever (most likely dead)
         * @returns true or false
         */
        isGone(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character is currently in a conversation with our character
         * @returns true or false
         */
        isInConversation(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character is currently indoors
         * @returns true or false
         */
        isIndoors(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character is currently outdoors
         * @returns true or false
         */
        isOutdoors(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character has the specified item in their inventory
         * @returns true or false
         */
        hasItem(DE: DEObject, char: DECompleteCharacterReference, itemName: string): boolean;
        /**
         * String indicating the current posture of the character
         * @returns "standing" | "crawling" | "climbing" | "sitting" | "lying_down" | "crouching" | "kneeling" | "hanging" | "floating" | "flying" | "swimming"
         */
        getPosture(DE: DEObject, char: DECompleteCharacterReference): DEPosture;
        /**
         * String indicating a location where another character should be at according to the character's knowledge
         * @returns eg. Eldoria, Shadowfen, or empty string if they have no idea
         */
        lastSaw(DE: DEObject, char: DECompleteCharacterReference): string;
        /**
         * Boolean indicating if the character is a member that got lost after being left behind (known to this member)
         * @returns true or false
         */
        hasNoIdeaWhereIs(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character does not know the questioned character and does not have a bond with them
         * @returns true or false
         */
        doesNotKnow(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character has a stranger relationship with the questioned character
         * @returns true or false
         */
        isStrangersWith(DE: DEObject, char: DECompleteCharacterReference, towardsChar: DECompleteCharacterReference): boolean;
        /**
         * Get the bond value of our character towards the questioned character
         * @returns eg. 50
         */
        getBondTowards(DE: DEObject, char: DECompleteCharacterReference, towardsChar: DECompleteCharacterReference): number;
        /**
         * Get the secondary bond value of our character towards the questioned character
         * @returns eg. 30
         */
        getSecondaryBondTowards(DE: DEObject, char: DECompleteCharacterReference, towardsChar: DECompleteCharacterReference): number;
        /**
         * Boolean indicating if our character is at the same location of the questioned character
         * @returns true or false
         */
        isAtSameLocation(DE: DEObject, char: DECompleteCharacterReference, char2: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if our character is with the questioned character, taking the same slot
         * @returns true or false
         */
        isAtSameSlot(DE: DEObject, char: DECompleteCharacterReference, char2: DECompleteCharacterReference): boolean;
        /**
         * Boolean indicating if the character is at the current location of the world
         * @returns true or false
         */
        isHere(DE: DEObject, char: DECompleteCharacterReference): boolean;
        /**
         * Formats a list with commas and 'and', do not use this for formatting causants use formatCommaList
         * @returns eg. Arya, Thalon, and Mira
         */
        formatAnd(DE: DEObject, list: string[]): string;
        /**
         * Formats a list with commas only, do not use this for formatting causants use formatCommaList
         * @returns eg. Arya, Thalon, Mira
         */
        formatCommaList(DE: DEObject, list: string[]): string;
        /**
         * Formats a list with commas and 'or'
         * @returns eg. Arya, Thalon, or Mira
         */
        formatOr(DE: DEObject, list: string[]): string;
        /**
         * Formats the object pronoun for a list of characters or a single character
         * @returns eg. are, is
         */
        formatVerbToBe(DE: DEObject, chars: Array<DECompleteCharacterReference | string>): string;
        /**
         * Formats the plural or singular form based on the list of characters or a single character
         * @returns eg. sword, swords
         */
        formatPluralOrSingular(DE: DEObject, chars: Array<DECompleteCharacterReference | string>, plural, singular): string;
        /**
         * Formats the object pronoun for a list of characters or a single character
         * @returns eg. him, her, them
         */
        formatObjectPronoun(DE: DEObject, chars: Array<DECompleteCharacterReference | string>): string;
        /**
         * Formats the possessive pronoun for a list of characters or a single character
         * @returns eg. his, her, their
         */
        formatPossessive(DE: DEObject, chars: Array<DECompleteCharacterReference | string>): string;
        /**
         * Formats the reflexive pronoun for a list of characters or a single character
         * @returns eg. himself, herself, themself
         */
        formatReflexive(DE: DEObject, chars: Array<DECompleteCharacterReference | string>): string;
        /**
         * Formats the pronoun for a list of characters or a single character
         * @returns eg. he, she, they
         */
        formatPronoun(DE: DEObject, chars: Array<DECompleteCharacterReference | string>): string;
        /**
         * Formats the ownership pronoun for a list of characters or a single character
         * @returns eg. his, hers, theirs
         */
        formatOwnershipPronoun(DE: DEObject, chars: Array<DECompleteCharacterReference | string>): string;
        /**
         * Generates a random seed integer from a string input for this specific character, the range will be from 0 to optionsNumber - 1, useful for creating random character traits for instantiable characters that will get a random name
         * @returns integer
         */
        getRandomSeedFromString(DE: DEObject, optionsNumber: number, inputString: string): number;
        /**
         * Generates a random seed based on the current world time, the range will be from 0 to optionsNumber - 1, useful for creating random events that change over time
         * @returns integer
         */
        getRandomSeedFromTime(DE: DEObject, optionsNumber: number): number;
        /**
         * Provides one of the random options by using the time as the seed
         * @returns string
         */
        getRandomOption(DE: DEObject, options: string[]): string;
        /**
         * Provides one of the random options by using the character name and time as the seed, useful for generating consistent random choices per character that change over time
         * @returns string
         */
        getRandomOptionFixedCharacter(DE: DEObject, char: DECompleteCharacterReference, options: string[]): string;
    }
}

declare interface DEWorldRule {
    /**
     * Description of the rule being enforced
     * eg. "Magic does not exist in this world, so {{char}} cannot use magic."
     */
    rule: DEStringTemplateCharOnly;
}

declare interface DEObject {
    user: DEMinimalCharacterReference;
    characters: Record<string, DECompleteCharacterReference>;
    bonds: Record<string, DEBondDescription>;
    worldNames: DENamePool;
    stateFor: Record<string, DEStateForCharacterWithHistory>;
    world: DEWorld;
    /**
     * All the conversations that have happened in the world
     * real or pseudo-conversations
     */
    conversations: Record<string, DEConversation>;
    /**
     * A list of important events that have happened in the world
     * subject to rumors, depending who got to be aware of it
     * // TODO
     */
    importantEvents: Record<string, DEImportantEvent>;
    /**
     * Function utilities available to scripts and other code parts
     */
    functions: FunctionTypes;
    /**
     * The initial time when the world was created
     */
    initialTime: DETimeDescription;
    /**
     * The current time in the world
     */
    currentTime: DETimeDescription;
    /**
     * The narration style of the world
     */
    narrationStyle: DENarrationStyle;
    /**
     * The rules that govern the world simulation
     * these are used to guide the world simulation LLM reasoning
     * and help it make decisions about what happens in the world
     */
    worldRules: Record<string, DEWorldRule>;
    /**
     * Utility functions for common operations
     */
    utils: DEUtils;
    /**
     * Whether the game is over or not, this means the user
     * has reached an ending condition, eg. died, arrested, successful completion, etc...
     * whatever the world defines as game over conditions
     */
    gameOver: boolean;
    /**
     * Arbitrary internal state that is used internally by the engine
     * and not meant to be used by the world scripts, these are for internal bookkeeping and optimizations, they can be used for whatever the engine needs, but they should not be used by the world scripts as they may change or be removed without warning
     */
    internalState: Record<string, any>;
    /**
     * Arbitrary state of the world that can be used for various purposes, eg. "world_age": 1000, "technology_level": "medieval", "has_magic": true, etc...
     */
    state: Record<string, any>;
    /**
     * List of interests that characters can have
     */
    interests: Record<string, DECharacterInterest>;
}

declare type DE = DEObject;

declare type DEScriptExposeProperties = Record<string, {
    type: "template" | "string" | "number" | "boolean" | "json";
    description?: string;
    propertyLocation: "world" | "characters" | "items";
}>;

declare interface DEScript {
    type: "world" | "characters" | "world-mechanic" | "character-mechanic" | "misc";

    /**
     * Description for the script
     */
    description?: string;

    /**
     * Exposes properties that serve as configuration, these are set by the UI
     * and are meant to be used by the UI
     */
    exposeProperties?: DEScriptExposeProperties;

    /**
     * Initialize gets called when the script is loaded, before the world is initialized, this is useful for setting up any necessary properties, functions, or other things that need to be in place before the world starts
     * @param DE 
     */
    initialize?(DE: DEObject): Promise<void> | void;

    /**
     * Important script where all the logic for the world is installed, this is where you set up the world, locations, characters, connections, etc... and also where you set up the main scene of the world and other important scenes
     * this function has a priority order where world functions get called first, then character functions, then world mechanic functions, then character mechanic functions, and finally misc functions, this means that if you have a world function and a character function with the same name, the world function will get called first, this allows for better organization of the code and also allows for more control over the execution order of the functions
     * @param DE 
     */
    onWorldInitialized?(DE: DEObject): Promise<void> | void;
    /**
     * Called before a character's inference is executed, allowing for any necessary preparations
     * @param DE 
     * @param characterName 
     */
    onInferencePrepareToExecute?(DE: DEObject, characterName: string): Promise<void> | void;
    /**
     * Called after a character's inference is executed, allowing for any necessary follow-up actions based on the inference results, the info parameter provides details about the inference results, such as the primary emotion detected, the emotional range, whether the character has died or reached a dead end, and a message describing the inference outcome
     * @param DE 
     * @param characterName 
     * @param info 
     */
    onInferenceExecuted?(DE: DEObject, characterName: string, info: {
        primaryEmotion: DEEmotionNames,
        emotionalRange: DEEmotionNames[],
        hasDied: boolean,
        hasDeadEnded: boolean,
        message: string,
    }): Promise<void> | void;
    /**
     * Called whenever a scene just started, but hasn't set up yet, allowing for any necessary preparations or actions to be performed right at the start of the scene, before the characters interact and before the scene is fully set up
     * @param DE 
     * @param scene 
     */
    onSceneStarted?(DE: DEObject, scene: DEScene): Promise<void> | void;
    /**
     * Called after a scene has started and is fully set up, right before the user's turn to talk
     * @param DE 
     * @param scene 
     */
    onSceneReady?(DE: DEObject, scene: DEScene): Promise<void> | void;
    /**
     * Called whenever a character wants to wander in the background, allowing for a standard simulation type of characters in the
     * background without LLM
     * 
     * If a character does not have wander behaviour they just stand still and do nothing unless the user interacts with them
     * 
     * The wander system can also make characters try to get away from user, for example, if the wander system says they need
     * to go to work, but the user is talking to them at home, they are injected into the prompt that the wander system wants
     * control and the character may try to leave the user to go to work, it's possible the user follows them
     * 
     * In order to build a belivable simulation, the wander system makes uses of the character social dynamics object and has
     * many utilities to make characters interact with each other in the background, make rumors, perform actions, etc... without the user's direct involvement,
     * but still making it feel alive and dynamic as they build a background story for the world
     * 
     * The wander system is purposefully left blank, so the developer can implement it as they see fit, with many functions
     * available in the utilities to help define the wander behaviour, for example, you can make characters have a routine where they go to work in the morning, then go to the gym, then go back home, etc...
     * or you can make them have a more dynamic wander behaviour where they interact with other characters in the background, make rumors, perform actions, etc... the possibilities are endless
     * 
     * The important thing is that they have a story, the LLM will make sense of the past wander actions once the character interacts with the user,
     * and it will make the character refer to those past wander actions in a coherent way, making the world feel more alive and dynamic
     *
     * @param DE 
     */
    onWander?(DE: DEObject): Promise<DEWanderAction> | DEWanderAction;

    /**
     * Other exports
     */
    [key: string]: any;
}

/**
 * This function is what gets called once the character wanders, without the user's direct involvement
 * so there is no LLM interacting with it
 * 
 * check out the utilities to see how to make the character wander and do thing, you can give the character
 * routines to do
 */
declare type DEWanderFunction = (DE: DEObject, character: DECharacter) => Promise<void> | void;

/**
 * A registry mapping script keys ("namespace/id") to their export types.
 * Extend this via declaration merging in your own `.d.ts` file to get automatic
 * return-type inference from `importScript` calls without any casting.
 *
 * @example
 * // In a custom types file (e.g. js/types/my-scripts.d.ts):
 * declare interface DEScriptRegistry {
 *     "bond-systems/my-custom-system": DEScript & {
 *         mySpecialMethod(DE: DEObject): void;
 *     };
 * }
 *
 * // importScript will then return the registered type automatically:
 * const script = await importScript("bond-systems", "my-custom-system");
 * script.mySpecialMethod(DE); // fully typed!
 *
 * @remarks
 * For scripts not yet registered here, `importScript` returns `DEScript | null`.
 * You can also cast at the call site:
 *
 * const bondSystem = /** @type {DEScript & { myProp: string }} *\/ (
 *     await importScript("bond-systems", "sfw-simplified-standard")
 * );
 */
declare interface DEScriptRegistry { }

/** Extract the namespace portion from a `"namespace/id"` registry key */
type _ScriptNS<K extends string = keyof DEScriptRegistry & string> =
    K extends `${infer NS}/${string}` ? NS : never;

/** Extract the id portion from a registry key that matches a given namespace */
type _ScriptID<NS extends string, K extends string = keyof DEScriptRegistry & string> =
    K extends `${NS}/${infer ID}` ? ID : never;

/**
 * The per-script module object, analogous to CommonJS `module`.
 * Set `engine.exports` to define what the script exposes to callers of `importScript`.
 * Internally `exports` starts as `{}` and can be `null` in some edge cases.
 */
declare interface engine {
    /**
     * The script's public API, analogous to `module.exports`.
     * Assign a {@link DEScript}
     */
    exports: DEScript;
}
declare var engine: engine;

/**
 * Imports a script by logical address (`namespace` + `id`), not a file path.
 * At runtime the resolver maps this to a file (e.g. `default-scripts/namespace/id.js`).
 *
 * Return type is inferred from {@link DEScriptRegistry} when the `"namespace/id"` key
 * is registered there; otherwise falls back to `DEScript | null`.
 *
 * When `DEScriptRegistry` has entries, both `namespace` and `id` will autocomplete
 * with registered values while still accepting arbitrary strings for unregistered scripts.
 *
 * @param namespace - The script category / namespace (e.g. `"bond-systems"`)
 * @param id        - The script identifier within the namespace (e.g. `"sfw-simplified-standard"`)
 * @param options   - `{ optional: true }` suppresses errors when the script cannot be resolved
 *
 * @example
 * // Unregistered — returns DEScript, no null:
 * const sys = await importScript("bond-systems", "sfw-simplified-standard");
 *
 * // With optional: true — may return null:
 * const sys = await importScript("bond-systems", "sfw-simplified-standard", { optional: true });
 *
 * // Registered in DEScriptRegistry — fully typed, no cast needed:
 * const sys = await importScript("bond-systems", "my-registered-system");
 * sys.myMethod(); // typed!
 */
declare var importScript: {
    <NS extends _ScriptNS | (string & {}), ID extends _ScriptID<NS & string> | (string & {})>(
        namespace: NS,
        id: ID,
        options: { optional: true }
    ): Promise<
        `${NS}/${ID}` extends keyof DEScriptRegistry
        ? DEScriptRegistry[`${NS}/${ID}`] | null
        : DEScript | null
    >;
    <NS extends _ScriptNS | (string & {}), ID extends _ScriptID<NS & string> | (string & {})>(
        namespace: NS,
        id: ID,
        options?: { optional?: false }
    ): Promise<
        `${NS}/${ID}` extends keyof DEScriptRegistry
        ? DEScriptRegistry[`${NS}/${ID}`]
        : DEScript
    >;
};