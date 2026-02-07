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
}

interface DEStringTemplateWithIntensityAndCausants {
    /**
     * Relevant template in question,
     * should be a yes/no question or similar
     * if yes is returned instead of a question mark at the end it will increase/decrease intensity to the specified level
     * 
     * You may also return just "yes" or "no" to increase or decrease intensity
     * 
     * Otherwise return a question mark at the end to indicate it is a question and it will
     * be fed to the LLM to determine if the state triggers/modifies intensity
     * 
     * Remember to make use of the bond system to determine
     * if a potential causant is good or not for triggering
     * the state (or increasing intensity)
     * 
     * for that you may use the potentialCausantMinBondRequired, potentialCausantMaxBondAllowed,
     * potentialCausantMin2BondRequired, potentialCausantMax2BondAllowed, etc...
     * to limit the characters that can trigger the state
     * 
     * That is provided that requiresCharacterCausants is true for this state
     * 
     * For example, say the state is NEEDS_AFFECTION
     * it may not be good for the state to be triggered by complete strangers
     * so you may want to write a template like:
     * 
     * potentialCausantMinBondRequired: 20
     * potentialCausantMaxBondAllowed: 100
     * potentialCausantMin2BondRequired: 20
     * potentialCausantMax2BondAllowed: 100
     * 
     * template:
     * "Is {{char}} getting a hug from {{format_or potential_causants}}?"
     * 
     * determineCausants:
     * "Who is hugging {{char}}?"
     * 
     * Alternatively you may define potential causants with this and 
     * 
     * Depending on the bond system, this basically means the state will only trigger
     * if someone the character has a good bond with and they know them and has
     * some romantic interest (if the second bond was used that way) is giving them a hug
     * then only the NEEDS_AFFECTION state will trigger
     * 
     * You may also add an opposite state, like DISGUSTED_BY_AFFECTION that triggers
     * for the opposite characters with bonds that just don't clear the threshold
     * for this state
     * 
     * """
     * {{#with (difference (get_present_conversing_social_group 20 100 20 100) (get_present_conversing_social_group -100 100 0 100)) as |potential_causants|}}
     *    {{#if potential_causants}}
     *       Is {{char}} receiving affection from {{format_or potential_causants}}?"
     *    {{/if}}
     * {{/with}}
     * """
     * 
     * You may wonder why the state description also has potentialCausantMinBondRequired, potentialCausantMaxBondRequired, etc...
     * That is because those are used to help the character reason and do not imply state activation, so say, you meet a character for the first time
     * as the reason, the potentialCausantNegativeDescription may help her reason with "{{char}} would feel uncomfortable hugging {{potential_causant}}"
     * meaning this character will not hug and will not allow hug, and the state won't even be considered for activation if none of the characters around
     * her fit the criteria
     * 
     * But if one does, that consumes inference LLM calls as the LLM will have to answer the questions, once a character is going to interact and speak,
     * the logic goes as follows:
     * 
     * 1. Determine all potential causants in the vicinity
     * 2. Are there any potentialCausants that fit the criteria? If not, skip to 4.
     * 3. If yes, ask the LLM the questions in the template to determine if the state triggers or its intensity modifies; update the state accordingly.
     * 4. Generate all the messages for the potentialCausantNegativeDescription and potentialCausantPositiveDescription and inject them into reasoning message, as well as the state the character is in, and
     * everything required for reasoning.
     * 5. Generate a short reasoning about what the character will do next, at this point the state is already updated OR if actionPromptInjection is set and one returns, that will override reasoning
     * 6. Proceed with the character message generation as usual.
     * 
     * This means the state activation and intensity modification is done before reasoning (or the actionPromptInjection), and the potentialCausant descriptions are just to help
     * reasoning about the character behaviour.
     * 
     * These YES/NO questions can be very expensive in terms of LLM calls. Make sure to optimize them well and avoid having too many, keep them as compact as possible; remember it is not just this
     * state, but all other states are also asking their own YES/NO questions as well, so the total number of LLM calls can skyrocket.
     */
    template: DEStringTemplate;
    /**
     * Intensity of the template effect, from -4 to 4
     */
    intensity: number | "DO_NOT_MODIFY_INTENSITY_ADD_CAUSANTS_ONLY" | "DO_NOT_MODIFY_INTENSITY_REMOVE_CAUSANTS_ONLY";
    /**
     * If the template holds true, how are causants handled
     * this should be a comma-separated list of causant names
     * if however the value ends with "?" it means that it is a question
     * that will be answered by the LLM to determine the causants
     * 
     * for example, say the template is "{{char}} is feeling scared and threatened by someone"
     * triggering the state FEARFUL
     * and the determineCausants is "who is {{char}} threatened by?"
     * 
     * It is also possible to just give it a static name eg.
     * for example, "{{char}} is in the dark forest"
     * triggering the state FEARFUL
     * and the determineCausants is "the dark forest"
     * it expects a list nevertheless, but for a single causant it will be just one item in the list
     * comma separate them, eg. Bob, Alice, the dark forest
     * 
     * Note if the causants represents a trigger with negative intensity, the causants will be removed from the state causants
     * instead of added to them, if the resulting causant list is empty, and the state requires causants, the state will be removed
     * 
     * For example, say the state is FEARFUL, and the character is currently fearful of Bob and Alice
     * now Bob shows himself as non threatening, based on the question "has {{format_or causants}} show themselves as non threatening?"
     * and the determineCausants is "Who has shown themselves as non threatening to {{char}}?" with a trail of "the characters not showing themselves as threatening anymore is " and a
     * determineCausantsAnswerForceGrammarTo LIST_OF_ANY_CAUSANTS (meaning the answer should be Bob, Alice, etc..)
     * then once "Bob" returns from the inference step, Bob will be removed from the causants of the FEARFUL state
     * meaning the character is now only fearful of Alice
     * 
     * If then Alice shows herself as non threatening as well, the causants list becomes empty
     * and the FEARFUL state is removed from the character as it requires causants to be active
     * 
     * if the state does not require causants, then the state remains active but with no causants
     */
    determineCausants?: DEStringTemplate | null;
    /**
     * The trail to determine the causants from, for example
     * if determineCausants is "who is {{char}} threatened by?"
     * determineCausantsTrail is "{{char}} is threatened by "
     */
    determineCausantsAnswerTrail?: DEStringTemplate | null;
    /**
     * The grammar to use when answering the determineCausants question
     * The default is LIST_OF_ANY_CAUSANTS
     */
    determineCausantsAnswerForceGrammarTo?: "LIST_OF_ANY_CAUSANTS" | "LIST_OF_CHARACTER_CAUSANTS" | "LIST_OF_OBJECT_CAUSANTS" | "SINGLE_ANY_CAUSANT" | "SINGLE_CHARACTER_CAUSANT" | "SINGLE_OBJECT_CAUSANT" | "SINGLE_CHARACTER_POTENTIAL_CAUSANT" | "LIST_OF_CHARACTER_POTENTIAL_CAUSANTS" | null;
    /**
     * Use an action accumulator to track the number of times this trigger/modifier has fired,
     * this does not include any trigger likelihood checks, only when the template holds true
     * the accummulator name should be unique per state per trigger/modifier (or it can be shared if that is desired)
     * 
     * eg. for example, let's say a character will only get angry after being insulted 3 times
     * you may have a trigger like:
     * """
     * Has {{char}} been insulted by {{format_or potential_causants}}?
     * """
     * with a determineCausants like:
     * """
     * Who has insulted {{char}}?
     * """
     * and an intensity of 1
     * and an action accumulator name of
     * {
     *    name: "insult_accumulator",
     *    usePerCausant: true,
     *    triggerThreshold: 3,
     *    reset: "when_state_triggers"
     * }
     * 
     * You may use trigger likelihood in addition to this to avoid the state triggering right at 3 consistently
     * every time, adding some randomness to it
     * 
     * An action accumulator can be used more creatively, for example, the character Mob Psycho 100, accumulates
     * emotional energy until it reaches a threshold and then it explodes in a psychic outburst, the accumulator can
     * be used to track the emotional energy accumulation until it reaches the threshold to trigger the outburst state
     * 
     * States with accumulators are expensive when used on triggers, as they are always evaluated every inference cycle to determine if the accumulator
     * has changed, while on intensity modifiers they have the same cost as normal; this is because triggers are evaluated until one is found that triggers the state
     * but if it has an accumulator, it must always be evaluated to update the accumulator value
     */
    useActionAccumulator?: {
        /**
         * Name of the accumulator to use, should be unique per character
         */
        name: string;
        /**
         * Whether to use a separate accumulator per causant, if causants are used and known
         * otherwise it would not make sense to use per causant
         */
        usePerCausant: boolean;
        /**
         * The threshold to trigger the state or intensity modification
         * basically the accumulator must hold this value or more to trigger
         */
        triggerThreshold: number;
        /**
         * When to reset the accumulator
         */
        reset?: "when_state_triggers" | "when_state_relieves" | "when_state_removed";
        /**
         * The number to accumulate towards the threshold each time the template holds true
         * default is 1, negative values are allowed to allow for decrementing accumulators
         */
        accumulateAmount?: number;
        /**
         * Resets the accumulator back to zero
         */
        resetIfNo?: boolean;
    };
    /**
     * If the answer to the triggers question is yes, this is the likelihood that the state will actually get triggered
     * anyway even if the condition holds true.
     * 
     * Statistically the check is not even done if this doesn't pass the likelihood check
     */
    triggerLikelihood?: number;
}

declare interface DEActionPromptInjection {
    /**
     * The template to inject into the character's action reasoning
     * remember this applies every inference cycle while the state is active
     * So be careful check actionPromptInjection documentation description for more details
     * on a proper use case
     */
    action: DEStringTemplate;
    /**
     * An optional narrive effect for the action, suppose for example the action is
     * {{char}} begins to cry
     * 
     * The narrative effect can be
     * When narrating describe {{char}} tantrum in detail and how the tears flow down their face
     * 
     * It's possible to have an action that only has a narrative effect and vice-versa
     * 
     * When only the narrative effect is provided, the character will not be forced to perform the given
     * action, but the narrative effect will still apply
     */
    narrativeEffect?: DEStringTemplate;
    /**
     * Whether the narrative effect should always apply even if the action is not performed
     * Or if no action is specified, in which case the narrative effect will always apply
     * even if another action is performed by the character
     */
    alwaysApplyNarrativeEffect?: boolean;
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
     * Whether this prompt injection should override any other
     * prompt injections from other states regardless of dominance, so
     * even a less dominant state can force its prompt injection
     * over more dominant states
     */
    forceDominant: boolean;
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
    vocabularyLimit?: string[];
}

declare interface DEActionPromptInjectionWithIntensity extends DEActionPromptInjection {
    /**
     * The intensity modification this action will cause provided
     * that something is injected, from -4 to 4
     * you may use 0 if you just want the character to perform
     * an action without modifying intensity
     */
    intensityModification: number;
}

declare interface DECharacterStateDefinition {
    /**
     * How dominant this state is compared to other states
     * used to determine which state takes precedence in case of conflicts
     */
    dominance: number;
    /**
     * How dominant this state is after being relieved
     */
    dominanceAfterRelief?: number;
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
    general: DEStringTemplate;
    /**
     * Description of the state after being relieved, used for reasoning about the state
     */
    generalAfterRelief?: DEStringTemplate;
    /**
     * Used for descriptions of the character general state
     * get applied at system prompt level
     */
    generalCharacterDescriptionInjection?: DEStringTemplate;
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
    actionPromptInjection: Record<string, DEActionPromptInjectionWithIntensity>;
    /**
     * Description of the state, used for reasoning about the state
     */
    relieving?: DEStringTemplate;
    /**
     * Used for descriptions of the character general state
     * get applied at system prompt level when relieving the state
     */
    relievingGeneralCharacterDescriptionInjection?: DEStringTemplate;
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
    relievingActionPromptInjection?: Record<string, DEActionPromptInjectionWithIntensity>;
    /**
     * Whether this state triggers a dead end that causes the character to be permanently removed from the story
     * use this for the description of the dead end scenario
     */
    triggersDeadEnd?: DEStringTemplate;
    /**
     * Whether the dead end scenario is a death scenario
     */
    deadEndIsDeath?: boolean;
    /**
     * Whether the dead end triggers after a certain time being in the state
     * meaning that the character has a time limit to relieve the state
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
    requiresPosture: "standing" | "sitting" | "laying_down" | null;
    /**
     * Whether the state requires a specific posture to trigger only
     */
    requiresPostureForTrigger?: "standing" | "sitting" | "laying_down" | null;
    /**
     * Whether the state seeks a specific posture once triggered
     * for example the TIRED state may seek laying_down posture
     * if null, posture is not sought
     */
    seeksPosture: "standing" | "sitting" | "laying_down" | null;
    /**
     * Whether the character falls down to the ground when the state is triggered
     * for example, the UNCONSCIOUS state may cause the character to fall down
     * when triggered
     */
    fallsDown: boolean;
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
     * States that are required for trigger only
     */
    requiredStatesForTrigger?: string[];
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
     * An instruction that gets added to the character description where a potential causant that does not fit
     * the criteria is set, for example, say the state is HUGGING, but the character has a low bond level, the
     * negative description could be "{{char}} would feel uncomfortable hugging {{potential_causant}}" this would
     * get injected into the system prompt, and reasoning step to help the character reason their behaviour
     */
    potentialCausantNegativeDescription?: DEStringTemplate;
    /**
     * An instruction that gets added to the character description where a potential causant that fits
     * the criteria is set, for example, say the state is HUGGING, and the character has a high bond level, the
     * positive description could be "{{char}} would feel happy hugging {{potential_causant}}" this would
     * get injected into the system prompt, and reasoning step to help the character reason their behaviour
     */
    potentialCausantPositiveDescription?: DEStringTemplate;
    /**
     * Minimum bond level required for a potential character causant to be considered valid to activate this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantMinBondRequired?: number;
    /**
     * Maximum bond level allowed for a potential causant to be considered valid to activate this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantMaxBondAllowed?: number;
    /**
     * Minimum 2-bond level required for a potential causant to be considered valid to activate this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantMin2BondRequired?: number;
    /**
     * Maximum 2-bond level allowed for a potential causant to be considered valid to activate this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantMax2BondAllowed?: number;
    /**
     * Whether a potential causant that is a stranger (no bond) is allowed to be a causant of this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantStrangerAllowed?: boolean;
    /**
     * Whether a potential causant that is not a stranger (has some bond) is denied to be a causant of this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantNonStrangerDenied?: boolean;
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
     * The triggers that can cause this state to pop up
     */
    triggers: Array<DEStringTemplateWithIntensityAndCausants>;
    /**
     * The intensity modifiers once the state is active, what might intensify it further
     * or relieve it
     */
    intensityModifiers: Array<DEStringTemplateWithIntensityAndCausants>;
    /**
     * The intensity modifiers when the state is being relieved, what might intensify it further
     * or relieve it
     */
    intensityModifiersDuringRelief?: Array<DEStringTemplateWithIntensityAndCausants>;
    /**
     * INTENSITY_EXPRESSIVE:
     * For example the state SCARED may be intensity expressive, it will cause the injection on the character state of:
     * - Susan is scared, susan is very Scared, Susan is extremely Scared, Susan is overwhelmingly Scared.
     * Depending on intensity level from 1 to 4
     * 
     * BINARY:
     * Either an on/off state, for example SLEEPING
     * - Susan is currently sleeping.
     * 
     * HIDDEN:
     * Hidden states do not get described in the character description, they are useful for states that are only used to determine
     * actions, for example TALKING_ABOUT_THEIR_FRIEND_BOB which triggers when the character is being asked about Bob and that
     * injects a specific prompt (or actions) about this context, and the state relieves when the character is no longer talking about Bob
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
     * Whether this state requires character causants to be triggered,
     * for example, say a state named IN_LOVE you may want to require a causant
     * you should have trackCausants enabled for this to work properly
     * 
     * check out the potentialCausant... properties to help the character reason
     */
    requiresCharacterCausants: boolean;
    /**
     * Whether this state requires object causants to be triggered,
     * for example, say a state named HATING_THE_FOREST you may want to require a causant
     * that is an inanimate object like "the forest" or "trees"
     * 
     * Honestly mostly useless to require object causants but here for completeness
     */
    requiresObjectCausants: boolean;
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
    vocabularyLimit?: string[];
}

declare interface DEBondIncreaseDecreaseQuestion {
    /**
     * The question to ask to determine if the bond increases or decreases
     * it should be a yes/no question
     * 
     * If nothing is returned, the bond does not change
     * 
     * If instead of a question it is "yes, ..." and does not end with "?" the bond increases by weight
     * as it is considered a static increase, emtpy string or "no, ..." means no change
     * 
     * In this template the value of {{other}} is the other character involved in the interaction
     */
    template: DEStringTemplate;
    /**
     * The weight of the bond increase or decrease
     */
    weight: number;
    /**
     * Whether this question affects the primary bond, secondary bond or both
     */
    affectsBonds: "primary" | "secondary" | "both";
}

declare interface DEBondDeclaration {
    /**
     * Name of the bond, useful to identify it
     */
    name: string;
    /**
     * Whether it is a stranger bond or not, stranger bonds are used
     * when characters have just met and have no prior relationship
     */
    strangerBond: boolean;
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
    description: DEStringTemplate;
    /**
     * An additional description that gets injected into the general description by the bond system
     * this is used for reasoning about the character relationships and what is possible
     */
    bondAdditionalDescription?: DEStringTemplate;
    /**
     * Used for descriptions of the character general bond state
     * get applied at system prompt level, per character that has this bond with this character
     * mostly used for general information, eg.
     * 
     * {{char}} trusts {{other}} a lot and would do anything for {{format_object_pronoun other}}.
     */
    generalCharacterDescriptionInjection?: DEStringTemplate;
    /**
     * Used for descriptions of the character general bond state when the bond is an ex bond
     * for the character has been removed from the story but the other character still exists
     * get applied at system prompt level, per character that has this bond with this character
     * mostly used for general information, eg.
     * 
     * {{char}} used to trust {{other}} a lot and be best friends but now {{other}} is gone and they feel sad about it.
     */
    generalCharacterDescriptionInjectionEx?: DEStringTemplate;
    /**
     * The questions to ask to determine bond increases or decreases
     * based on interactions and events happening in the story
     */
    bondConditions: DEBondIncreaseDecreaseQuestion[];
}

declare interface DEEmotionDefinition {
    common: boolean;
    uncommon: boolean;
    triggeredByStates: string[];
}

declare type DEPropertyValueGetterInCharSpace = (DE: DEObject, char: DECompleteCharacterReference) => any;

declare interface DEPropertyValueInCharSpace {
    type: "value_getter_char_space",
    id: string;
    value: DEPropertyValueGetterInCharSpace;
}

declare type DEPropertyValueGetter = (DE: DEObject) => any;

declare interface DEPropertyValue {
    type: "value_getter",
    id: string;
    value: DEPropertyValueGetter;
}

declare type DEPropertyValueGetterInItemSpace = (DE: DEObject, item: DEItem) => any;

declare interface DEPropertyValueInItemSpace {
    id: string;
    value: DEPropertyValueGetterInItemSpace;
    type: "value_getter_item_space";
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
    "embarassed" | "shy" | "sheepish" | "blushing" | "ashamed" | "guilty" |
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
    "determined" | "serious" | "resolute" | "steadfast" | "persistent" | "confident" | "proud"

// confronted 

declare interface DECompleteCharacterReference extends DEMinimalCharacterReference {
    /**
     * Arbitrary properties attached to the character
     */
    properties: Record<string, DEPropertyValueInCharSpace>;

    /**
     * Injects extra information into the character's general description
     * every inference cycle, these get applied at a system prompt level
     * so it should be writte in 3rd person format
     */
    generalCharacterDescriptionInjection: Record<string, DEStringTemplate>;
    
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
    actionPromptInjection: Record<string, DEActionPromptInjection>;

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
    general: DEStringTemplate;
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
    schizophrenicVoiceDescription: DEStringTemplate;
    /**
     * How much the character likes to wander around aimlessly in locations
     * without a specific goal, from 0 to 1, higher means more likely to wander
     * 
     * A value of 1 means that the character will often wander around locations
     * exploring them without a specific goal or purpose, they may just walk around
     * looking at things and interacting with the environment randomly
     * 
     * A value of 0 means that the character will never wander around aimlessly,
     * they will always have a specific goal or purpose in mind when moving around
     */
    wanderPotential: number;
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
    states: Record<string, DECharacterStateDefinition>;
    /**
     * The bonds this character develops towards other characters in the world and how
     * it evolves.
     * 
     * The bond system is a 3 dimensional grid of sorts, basically there is a stranger bond
     * type, which is the bond towards strangers, it should probably not be very well defined, for example
     * just have bond between -100 to 0 (for stranger that give negative interactions) and 0 to 100 (for strangers that give positive interactions)
     * you can refer to bonds in the state conditions
     */
    bonds: {
        /**
         * The bond system type, an arbitrary string to identify the bond system
         * by default DE engine will provide "DEFAULT" and "DEFAULT_WITH_ROMANCE"
         * this helps potential scripts and systems identify which bond system is being used
         * and apply specific logic if needed
         */
        system: string;
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
        descriptionGeneralInjection: DEStringTemplate | null;
    };
    emotions: Partial<Record<DEEmotionNames, DEEmotionDefinition>>;
    scripts: {
        spawn: Record<string, DEScript>;
        preStateCheck: Record<string, DEScript>;
        preInference: Record<string, DEScript>;
        firstInteract: Record<string, DEScript>;
        postInference: Record<string, DEScript>;
        postAnyInference: Record<string, DEScript>;
    };
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
    vocabularyLimit?: string[];
}

declare interface DENamePool {
    mal: Array<string>;
    fem: Array<string>;
    amb: Array<string>;
}

declare interface DESingleBondDescription {
    towards: string;
    stranger: boolean;
    bond: number;
    bond2: number;
    createdAt: DETimeDescription;
}

declare interface DEBondDescription {
    active: Array<DESingleBondDescription>;
    ex: Array<DESingleBondDescription>;
}

declare interface DEStateCausant {
    name: string;
    type: "character" | "object";
}

declare interface DEStateCause {
    description: string;
}

declare interface DEStateDescription {
    state: string;
    /**
     * Whether the state is currently in a relieving state
     */
    relieving: boolean;
    intensity: number;
    causants: Array<DEStateCausant> | null;

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
    capacityLiters: number;
    capacityKg: number;
    description: string;
    descriptionWhenWorn: string | null;
    descriptionWhenCarried: string | null;
    compartimentName: string | null;
    isSeeThrough: boolean;
    // canSitOn: boolean;
    // canLieOn: boolean;
    properties: Record<string, DEPropertyValueInItemSpace>;
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
    containing: Array<DEItem>;
    /**
     * The items that this item is made of, for example a wooden table
     * may be made of planks and nails
     * 
     * This is currently not used natively by the engine but it may be useful
     * by scripts or external systems that want to do crafting or similar mechanics
     */
    madeOf?: Array<DEItem>;
    /**
     * The amount of this item in the stack
     */
    amount: number;

    /**
     * The placement of the item in the location or on the character
     * or within the container item
     * 
     * this should be generated using the LLM
     */
    placement: string;
    
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
}

declare interface DESeenItem {
    name: string;
    amount: number;
    location: string;
    locationSlot: string;
    carriedByCharacter: string | null;
    wornByCharacter: string | null;
    placement: string;
}

declare interface StateForDescription {
    id: string;
    location: string;
    locationSlot: string;
    states: Array<DEStateDescription>;
    type: "INTERACTING" | "BACKGROUND";
    time: DETimeDescription;
    conversationId: string | null;
    /**
     * The message ID of the last message the character sent in the current conversation,
     * when this state was added
     */
    messageId: string | null;
    isTopNaked: boolean;
    isBottomNaked: boolean;
    surroundingNonStrangers: Array<string>;
    surroundingTotalStrangers: Array<string>;
    partiallyExposedToWeather: string | null;
    fullyExposedToWeather: string | null;
    posture: "standing" | "sitting" | "laying_down";
    /**
     * The name of the item the character is using to sit, stand or lay down on or null if none
     * if none that means the character is using the ground/floor/etc
     */
    postureAppliedOn: string | null;
    carrying: DEItem[];
    carryingCharacters: Array<string>;
    wearing: DEItem[];
    beingCarriedByCharacter: string | null;
    currentAgeMinutes: number;
    currentWeightKg: number;
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
     * These can be subject to memory, do not modify surroundingNonStrangers or surroundingTotalStrangers
     * 
     * These can be subject to memory
     */
    seenCharacters: Array<string>;
}

declare interface DEStateForDescriptionWithHistory extends StateForDescription {
    history: Array<StateForDescription>;
}

declare interface DELocationSlot {
    description: DEStringTemplate;
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
    items: Array<DEItem>;
}

declare interface WeatherSystemApplyingStateWithIntensity {
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
    fullEffectDescription: DEStringTemplate;
    /**
     * Description of the weather system's partial effects on a partially sheltered location
     * 
     * Note that you can add more nuance to the partial effect description by checking
     * the character's states, for example by having different partial effects if the character
     * is very light
     * 
     * eg. "{{#if (and (< (get_weight char) 20) (is_outdoors char))}}{{char}} is drenched by the relentless rain, shivering as the cold water soaks through their light clothing.{{else}}...{{/if}}"
     */
    partialEffectDescription: DEStringTemplate;
    /**
     * Description when there is no effect on a fully sheltered location
     */
    noEffectDescription: DEStringTemplate;
    /**
     * Description of the weather system effects when it is having an extra negative effect on the character
     */
    negativelyExposedDescription: DEStringTemplate;
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
    fullyProtectedTemplate?: DEStringTemplate | null;
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
    applyingStatesDuringFullEffect: Array<WeatherSystemApplyingStateWithIntensity>;
    /**
     * Names of states that are applied to characters while they are partially exposed to the weather system
     * eg. "SLIGHTLY_WET" for rain, "SLIGHTLY_SUNBURNED" for sunny weather
     */
    applyingStatesDuringPartialEffect: Array<WeatherSystemApplyingStateWithIntensity>;
    /**
     * Names of states that are applied to characters while they are not exposed to the weather system
     * and fully sheltered from it
     */
    applyingStatesDuringNoEffect: Array<WeatherSystemApplyingStateWithIntensity>;
    /**
     * Names of states that are added if they are in a negative effect state and exposed to the weather system
     */
    applyingStatesDuringNegativeEffect: Array<WeatherSystemApplyingStateWithIntensity>;
    /**
     * Whether to apply the states in the order they are listed in the arrays above along the duration of exposure
     * or to apply them all at once on contact with the weather system
     */
    applyStatesInOrder: boolean;
}

declare interface DEUnlockCondition {
    /**
     * Description of the unlock condition, this will be inferenced with llm
     * eg. {{char}} inputs the code "1234" into the keypad
     */
    opensIf: DEStringTemplate;
    /**
     * Mostly meant for the user to check if the condition is met
     * eg. has {{char}} input "1234" into the keypad?
     * The answer should be yes for the condition to be considered met
     * and the entrance to be unlocked
     */
    yesNoQuestion: DEStringTemplate;
}

declare interface DEEntrances {
    /**
     * Name of the entrance, eg. "front door", "keypad door", "bridge", "garage door"
     */
    name: string;
    /**
     * Description of the entrance
     */
    description: DEStringTemplate;
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
    description: DEStringTemplate;
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
    properties: Record<string, any>;
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
}

declare interface DEStatefulLocationDefinition extends DELocationDefinition {

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
    currentWeatherFullEffectDescription: DEStringTemplate;
    /**
     * Either the location-specific partial effect description or the general weather partial effect description
     */
    currentWeatherPartialEffectDescription: DEStringTemplate;
    /**
     * Either the location-specific no effect description or the general weather no effect description
     */
    currentWeatherNoEffectDescription: DEStringTemplate;
    /**
     * Either the location-specific negative effect description or the general weather negative effect description
     */
    currentWeatherNegativelyExposedDescription: DEStringTemplate;
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
     * They can be seen if the character or user is in debug mode
     */
    isDebugMessage: boolean;
    /**
     * The content of the message
     */
    content: string;
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
     * An optonal short summary of the conversation and what happened in it
     * it should be available when it is a pseudoConversation
     * 
     * if one is not found, the LLM will be prompted to generate one
     * randomly, or whatever is set as the pseudoConversation generator in the world scripts
     * 
     * Generating summaries can be costly in terms of tokens, so it is recommended to
     * set up a pseudoConversation generator script that generates summaries
     * as part of the world scripts after each pseudo-conversation ends
     * to avoid having to generate them on demand later
     */
    summary: string | null;
}

declare interface DEScript {
    type: "script";
    id: string;
    execute: (DE: DEObject, char: DECompleteCharacterReference) => any | Promise<any>;
}
declare interface DEScriptSource {
    id: string;
    type: "template" | "script" | "value_getter_char_space" | "value_getter_item_space";
    source: string;
    sourceType: "handlebars" | "javascript";
    imports: string[];
    run: (...args: any[]) => any;
}
declare type DEStringTemplateFunction = (
    /**
     * Always available the DE object representing the whole simulation
     */
    DE: DEObject,
    /**
     * Always available the character invoking the template
     */
    char: DECompleteCharacterReference,
    /**
     * Only available in bond description templates
     */
    other: DECompleteCharacterReference,
    /**
     * Only available in state action/effect templates
     */
    causants: DEStateCausant[],
    /**
     * Only really available in
     * potentialCausantNegativeDescription
     * and
     * potentialCausantPositiveDescription
     */
    potentialCausant: DECompleteCharacterReference,
    /**
     * Only really available when called from a state trigger template
     */
    potentialCausants: DECompleteCharacterReference[],
) => Promise<string> | string;

declare type DEStringTemplate = {
    type: "template";
    id: string;
    execute: DEStringTemplateFunction;
}

declare interface DEWanderHeuristic {
    /**
     * Names of locations where the character can wander around freely
     * this should set by the world, not by the character creator, as it depends on the world design
     * make it null to allow wandering everywhere, the character will just keep wandering around the world
     * otherwise it will only wander within the specified locations
     * 
     * If a character is not within its wanderConfinement locations, it will try to go to the nearest one
     * before wandering around it, characters only wander when they are free of the user
     */
    wanderConfinement: string[] | null;
    /**
     * Primary location where the character wanders when no other location is specified
     * this should set by the world upon the character, not by the character creator
     */
    wanderPrimaryLocation: string | null;
    /**
     * If the character is interacting with the user and is outside its wanderConfinement locations,
     * it will activate a specific state, use this state to make the character try to leave user and
     * go to the nearest wanderConfinement location
     */
    wanderOutsideConfinementActivatesState: string | null;
}

declare interface DEInitialScene {
    /**
     * The starting location ID for the initial scene
     */
    startingLocation: string;
    /**
     * The starting location slot within the starting location
     */
    startingLocationSlot: string;
    /**
     * The narration that sets up the initial scene
     */
    narration: DEStringTemplate;
    /**
     * Characters that will be engaged with the user at the start of the scene
     * these characters will be in a conversation with the user right away
     * make sure that the characters are spawned in the location with the user
     * otherwise they won't be able to interact
     */
    startingEngagedCharacters: Array<string>;
    /**
     * Whether the characters will interact first in the cycle, rather than the user
     * this is useful for scenes where the characters start by talking rather than
     * the user starting the interaction
     */
    charactersStart: boolean;
    /**
     * The initial time when the scene starts
     */
    initialTime: DETimeDescription | null;
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
     * Initial scenes that set up the world at the beginning of the simulation
     */
    initialScenes: Record<string, DEInitialScene>;
    /**
     * Whether it has started the initial scene or not, useful to know
     * when the world is just starting anew
     */
    hasStartedScene: boolean;
    /**
     * Whether the world has finished initializing or not, basically if
     * all spawn scripts have ran and the world is ready for the first inference cycle
     * and starting the scene
     */
    hasInitializedWorld: boolean;
    /**
     * This is a template that describes the overall world lore and setting
     * it gets injected into various prompts to help ground the world simulation
     * it is also used by characters to understand the world they are in
     * and detect lies or inconsistencies
     */
    lore: DEStringTemplate | null;
    /**
     * World scripts run at the world level when it initializes
     * they run after each character has been set up and spawned
     * but before the first inference cycle starts, the character will
     * be the user character
     * 
     * These world scripts run to set up the world and add locations
     * and items, because the json object representing the world does
     * not really support that directly
     */
    worldScripts: Record<string, DEScript>;
    /**
     * Scripts that run when any character spawns in the world
     * these run for every character that spawns including the user character
     * these run after the character spawn scripts
     */
    worldAllCharacterSpawnScripts: Record<string, DEScript>;
    /**
     * Scripts to run when the world scene initializes, the key
     * being the scene id
     */
    worldSceneInitializationScripts: Record<string, DEScript>;
}

declare interface DEUtils {
    newHandlebarsTemplate(DE: DEObject, id: string, source: string): DEStringTemplate;
    newTemplateFromFunction(DE: DEObject, id: string, func: DEStringTemplateFunction): DEStringTemplate;
    newLocationFromStaticDefinition(DE: DEObject, definition: DELocationDefinition): DEStatefulLocationDefinition;
    newConnectionFromStaticDefinition(DE: DEObject, definition: DEConnection): DEConnection;
    /**
     * Important anything created with this function cannot access variables outside its scope
     * due to the way the function is created and sandboxed for security reasons
     * @param DE 
     * @param id 
     * @param execute 
     */
    newValueGetterScriptForCharacterSpace(DE: DEObject, id: string, value: DEPropertyValueGetterInCharSpace): DEPropertyValueInCharSpace;
    /**
     * Important anything created with this function cannot access variables outside its scope
     * due to the way the function is created and sandboxed for security reasons
     * @param DE 
     * @param id 
     * @param execute 
     */
    newValueGetterScriptForItemSpace(DE: DEObject, id: string, value: DEPropertyValueGetterInItemSpace): DEPropertyValueInItemSpace;
    /**
     * Important anything created with this function cannot access variables outside its scope
     * due to the way the function is created and sandboxed for security reasons
     * @param DE 
     * @param id 
     * @param execute 
     */
    newScript(DE: DEObject, id: string, execute: (DE: DEObject, char: DECompleteCharacterReference) => any | Promise<any>): DEScript;
    newWeatherSystem(DE: DEObject, definition: DEWeatherSystem): DEWeatherSystem;
    /**
     * Converts the given property value into a template that can be executed
     * @param value 
     * @returns 
     */
    propertyValueToTemplate: (DE: DEObject, value: DEPropertyValueInCharSpace) => DEStringTemplate;
}

declare interface DEWorldRule {
    /**
     * Description of the rule being enforced
     * eg. "Magic does not exist in this world, so {{char}} cannot use magic."
     */
    rule: DEStringTemplate;
}

declare interface DEActionAccumulators {
    accumulators: Record<string, number>;
}

declare interface DEObject {
    actionAccumulators: Record<string, DEActionAccumulators>;
    user: DEMinimalCharacterReference;
    characters: Record<string, DECompleteCharacterReference>;
    social: {
        bonds: Record<string, DEBondDescription>;
    };
    allNames: DENamePool;
    worldNames: DENamePool;
    stateFor: Record<string, DEStateForDescriptionWithHistory>;
    world: DEWorld;
    /**
     * All the conversations that have happened in the world
     * real or pseudo-conversations
     */
    conversations: Record<string, DEConversation>;
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
     * All the script sources available in the world for dynamic execution
     * they can be handlebars templates or javascript functions
     */
    scriptSources: DEScriptSource[];
    /**
     * The rules that govern the world simulation
     * these are used to guide the world simulation LLM reasoning
     * and help it make decisions about what happens in the world
     */
    worldRules: Record<string, DEWorldRule>;
    /**
     * Heuristics that guide character wandering behaviour
     * as how the character decides where to go when wandering
     * without a heuristic a character will just stand still forever
     */
    wanderHeuristics: Record<string, DEWanderHeuristic>;
    /**
     * Utility functions for common operations
     */
    utils: DEUtils;
    /**
     * Whether the game is over or not, this means the user
     * has reached an ending condition, eg. died, arrested, sucesful completition, etc...
     * whatever the world defines as game over conditions
     */
    gameOver: boolean;
}

declare type DE = DEObject;
declare var DE: DEObject;
declare var char: DECompleteCharacterReference;
declare var other: DECompleteCharacterReference;
declare var causant: DECompleteCharacterReference;
declare var potentialCausant: DECompleteCharacterReference;
declare var potentialCausants: DECompleteCharacterReference[];