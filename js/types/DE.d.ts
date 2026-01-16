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
     * Short description when the character is completely naked
     * aka no clothes or accessories on them at all, useful for
     * animals or scenarios where the character is stripped of all clothing,
     * note that you should still not specify the character as being fully nude
     * just describe their physical appearance without clothes, that is because
     * they may still have accessories like glasses, jewelry, piercings, bracelet, small shirt, etc...
     */
    shortDescriptionNaked: string | null;
}

interface DEStringTemplateWithIntensityAndCausants {
    /**
     * Relevant template in question,
     * should be a yes/no question or similar, yes
     * will increase intensity, no will decrease it
     */
    template: DEStringTemplate;
    /**
     * Intensity of the template effect
     */
    intensity: number;
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
     */
    determineCausants: DEStringTemplate;
    /**
     * If the template holds true, how to determine the cause of the state
     * if it ends with "?" it means that it is a question
     * that will be answered by the LLM to determine the cause
     * 
     * for example, say the template is "{{char}} is feeling scared and threatened by someone"
     * triggering the state FEARFUL
     * and the determineCause is "why is {{char}} feeling scared by {{causant}}?"
     * 
     * It is also possible to just give it a static cause eg.
     * for example, "{{char}} is in the dark forest"
     * triggering the state FEARFUL
     * and the determineCause is "{{char}} is alone in the dark forest"
     */
    determineCause: DEStringTemplate;
}

declare interface CharacterStateDefinition {
    /**
     * How dominant this state is compared to other states
     * used to determine which state takes precedence in case of conflicts
     */
    dominance: number;
    /**
     * Description of the state, used for reasoning about the state
     */
    general: DEStringTemplate;
    /**
     * Used for descriptions of the character general state
     * get applied at system prompt level
     */
    systemPromptInjection: DEStringTemplate;
    /**
     * Very strong, used for instructions that the character must follow
     * make sure that it is not kept every inference cycle unless intended
     * as the character will be forced to follow it no matter what
     * you may use a randomizing function to return an empty string sometimes
     * to avoid the character being stuck in a loop of following the same instruction
     * or you may choose to give different instructions each time
     * 
     * Setting the reason prompt injection will disable reasoning in the character about
     * what they will do next as they will be forced to follow the instructions
     * 
     * If two injections are set at the same time by different states, the one from the state with higher dominance will take precedence,
     * if they have the same dominance, one will be chosen at random
     */
    promptInjection: DEStringTemplate;
    /**
     * Description of the state, used for reasoning about the state
     */
    relieving: DEStringTemplate;
    /**
     * Used for descriptions of the character general state
     * get applied at system prompt level when relieving the state
     */
    relievingSystemPromptInjection: DEStringTemplate;
    /**
     * Very strong, used for instructions that the character must follow
     * make sure that it is not kept every inference cycle unless intended
     * as the character will be forced to follow it no matter what
     * you may use a randomizing function to return an empty string sometimes
     * to avoid the character being stuck in a loop of following the same instruction
     * or you may choose to give different instructions each time
     * 
     * Setting the prompt injection will disable reasoning in the character about
     * what they will do next as they will be forced to follow the instructions
     * 
     * If two injections are set at the same time by different states, the one from the state with higher dominance will take precedence,
     * if they have the same dominance, one will be chosen at random
     */
    relievingPromptInjection: DEStringTemplate;
    /**
     * Whether this state triggers a dead end that causes the character to be permanently removed from the story
     * use this for the description of the dead end scenario
     */
    triggersDeadEnd: DEStringTemplate;
    /**
     * Whether the dead end scenario is a death scenario
     */
    deadEndIsDeath: boolean;
    /**
     * A random chance (0 to 1) that the state will trigger a dead end
     * every time this state is active
     */
    triggersDeadEndRandomChance: number;
    /**
     * A random chance (0 to 1) that the state will trigger a dead end
     * every time this state is being relieved
     */
    triggersDeadEndWhileRelievingRandomChance: number;
    requiresPosture: "standing" | "sitting" | "laying_down" | "";
    seeksPosture: "standing" | "sitting" | "laying_down" | "";
    fallsDown: boolean;
    randomSpawnRate: number;
    conflictStates: string[];
    requiredStates: string[];
    triggersStates: { [stateName: string]: { intensity: number } };
    relievesStates: { [stateName: string]: { intensity: number } };
    triggersStatesOnRelieve: { [stateName: string]: { intensity: number } };
    /**
     * An instruction that gets added to the character description where a potential causant that does not fit
     * the criteria is set, for example, say the state is HUGGING, but the character has a low bond level, the
     * negative description could be "{{char}} would feel uncomfortable hugging {{potential_causant}}" this would
     * get injected into the system prompt, and reasoning step to help the character reason their behaviour
     */
    potentialCausantNegativeDescription: DEStringTemplate;
    /**
     * An instruction that gets added to the character description where a potential causant that fits
     * the criteria is set, for example, say the state is HUGGING, and the character has a high bond level, the
     * positive description could be "{{char}} would feel happy hugging {{potential_causant}}" this would
     * get injected into the system prompt, and reasoning step to help the character reason their behaviour
     */
    potentialCausantPositiveDescription: DEStringTemplate;
    /**
     * Minimum bond level required for a potential character causant to be considered valid to activate this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantMinBondRequired: number;
    /**
     * Maximum bond level allowed for a potential causant to be considered valid to activate this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantMaxBondAllowed: number;
    /**
     * Minimum 2-bond level required for a potential causant to be considered valid to activate this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantMin2BondRequired: number;
    /**
     * Maximum 2-bond level allowed for a potential causant to be considered valid to activate this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantMax2BondAllowed: number;
    /**
     * Whether a potential causant that is a stranger (no bond) is allowed to be a causant of this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantStrangerAllowed: boolean;
    /**
     * Whether a potential causant that is not a stranger (has some bond) is allowed to be a causant of this state
     * if no characters are around, no questions are asked about triggering the state if requiresCausant is true
     */
    potentialCausantNonStrangerAllowed: boolean;
    /**
     * The decay rate per inference cycle when the state is active
     */
    decayRatePerInferenceCycle: number;
    /**
     * If the answer to the triggers question is yes, this is the likelihood that the state will actually get triggered
     * anyway even if the condition holds true.
     * 
     * Statistically the check is not even done if this doesn't pass the likelihood check
     */
    triggerLikelihood: number;
    /**
     * The triggers that can cause this state to pop up
     */
    triggers: Array<DEStringTemplateWithIntensityAndCausants>;
    /**
     * The intensifiers once the state is active, what might intensify it further
     */
    intensifiers: Array<DEStringTemplateWithIntensityAndCausants>;
    /**
     * The relievers do the opposite of the intensifiers and reduce the state intensity, they may even make it go away
     */
    relievers: Array<DEStringTemplateWithIntensityAndCausants>;
    /**
     * Whether this represents a binary behaviour of sorts, in such a case, while the intensity still may vary
     * it doesn't say things like Overwhemingly or extremely (STATE_NAME) for example if the state is SLEEPING vs SCARED
     * Sleeping may be deeming binary behaviour. Susan is sleeping.
     * But scared may allow intensity expressiongs, Susan is scared, susan is very scared, Susan is extremely scared, Susan is overwhelmingly scared.
     */
    binaryBehaviour: boolean;
    /**
     * Whether the releif uses a decay rate that reduces intensity over time
     * this is only regarding states that have relief mechanisms
     */
    reliefUsesDecayRate: boolean;
    /**
     * The decay rate applied to the relief mechanism if reliefUsesDecayRate is true
     */
    decayRateAfterRelief: number;
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
}

declare interface DEBondIncreaseDecreaseQuestion {
    question: DEStringTemplate;
    mustHaveStateWithCharacterCausant: string;
    weight: number;
}

declare interface DEBondDeclaration {
    name: string;
    strangerBond: boolean;
    minBondLevel: number;
    maxBondLevel: number;
    min2BondLevel: number;
    max2BondLevel: number;
    description: DEStringTemplate;
    bondConditions: DEBondIncreaseDecreaseQuestion[];
    secondBondConditions: DEBondIncreaseDecreaseQuestion[];
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
    properties: Record<string, DEPropertyValueInCharSpace>;

    /**
     * Injects extra information into the character's general description
     * every inference cycle, these get applied at a system prompt level
     * so it should be writte in YOU format to address the assistant identity
     */
    injectableInGeneralText: Record<string, DEStringTemplate>;

    /**
     * These are similar to user prompt injections in the state but they don't need any
     * state, use them with caution as they will override the character's reasoning every inference cycle
     * 
     * They will get overridden by state-based reason prompt injections if those are present
     * since the ones here are for general purposes and may conflict with state-based ones
     * 
     * These will override reasoning just like state-based reason prompt injections do
     */
    injectableInReasoning: Record<string, DEStringTemplate>;
    general: DEStringTemplate;
    initiative: number;
    strangerInitiative: number;
    strangerRejection: number;
    autism: number;
    schizophrenia: number;
    schizophrenicVoiceDescription: DEStringTemplate | null;
    wanderPotential: number;
    states: Record<string, CharacterStateDefinition>;
    bonds: Array<DEBondDeclaration>;
    emotions: Partial<Record<DEEmotionNames, DEEmotionDefinition>>;
    scripts: {
        spawn: Array<DEScript>;
        preStateCheck: Array<DEScript>;
        preInference: Array<DEScript>;
        firstInteract: Array<DEScript>;
        postInference: Array<DEScript>;
        postAnyInference: Array<DEScript>;
    };
}

declare interface DENamePool {
    mal: Array<string>;
    fem: Array<string>;
    amb: Array<string>;
}

declare interface SingleBondDescription {
    towards: string;
    stranger: boolean;
    bond: number;
    bond2: number;
}

declare interface BondDescription {
    active: Array<SingleBondDescription>;
    ex: Array<SingleBondDescription>;
}

declare interface StateCausant {
    name: string;
    type: "character" | "object";
}

declare interface StateCause {
    description: string;
    causant: string | null;
}

declare interface StateDescription {
    state: string;
    /**
     * Whether the state is currently in a relieving state
     */
    relieving: boolean;
    intensity: number;
    causants: Array<StateCausant> | null;
    causes: Array<StateCause> | null;

    /**
     * The time when this state was first activated that was contiguous with the current state
     * as in the character did not relieve or have the state removed in between inference cycles
     * it just keeped being active
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
    canSitOn: boolean;
    canLieOn: boolean;
    properties: Record<string, DEPropertyValueInItemSpace>;
    isConsumable: boolean;
    consumableProperties: {
        calories: number;
        hydrationLiters: number;
    } | null;
    /**
     * Whether this item covers nakedness when worn
     */
    coversNakedness: boolean;
    containing: Array<DEItem>;
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
     * Use this to prevent characters from picking up this item, this is useful
     * for example with furniture and other fixed items in the location
     * that the character should not be able to pick up and carry around
     */
    nonPickable: boolean;
}

declare interface StateForDescription {
    id: string;
    location: string;
    locationSlot: string;
    states: Array<StateDescription>;
    type: "INTERACTING" | "BACKGROUND";
    time: DETimeDescription;
    conversationId: string | null;
    /**
     * The message ID of the last message the character sent in the current conversation,
     * when this state was added
     */
    messageId: string | null;
    surroundingNonStrangers: Array<string>;
    surroundingStrangers: Array<string>;
    partiallyExposedToWeather: string | null;
    fullyExposedToWeather: string | null;
    posture: "standing" | "sitting" | "laying_down";
    /**
     * The id of the item the character is using to sit, stand or lay down on or null if none
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
}

declare interface StateForDescriptionWithHistory extends StateForDescription {
    history: Array<StateForDescription>;
}

declare interface LocationSlot {
    description: DEStringTemplate;
    /**
     * Maximum height in centimeters that can fit in this slot
     * will override location-based max height if specified
     */
    maxHeightCm?: number;
    /**
     * Maximum weight in kilograms that can fit in this slot
     * will override location-based max weight if specified
     */
    maxWeightKg?: number;
    /**
     * Maximum volume in liters that can fit in this slot
     * will override location-based max volume if specified
     */
    maxVolumeLiters?: number;
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
    items: Array<DEItem>;
}

declare interface WeatherSystem {
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
     */
    fullEffectDescription: DEStringTemplate;
    /**
     * Description of the weather system's partial effects on a partially sheltered location
     */
    partialEffectDescription: DEStringTemplate;
    /**
     * Description when there is no effect on a fully sheltered location
     */
    noEffectDescription: DEStringTemplate;
    /**
     * Whether the weather system's full effects will cause character death
     */
    fullEffectKills: boolean;
    /**
     * If fullEffectKills is true, after how many hours of exposure will the character die
     */
    fullEffectKillsExposureHours: number;
    /**
     * Whether the weather system's partial effects will cause character death
     */
    partialEffectKills: boolean;
    /**
     * If partialEffectKills is true, after how many hours of exposure will the character die
     */
    partialEffectKillsExposureHours: number;
    /**
     * Whether when the character is in negatively affecting states, they will die from the weather system's effects
     */
    negativeEffectKills: boolean;
    /**
     * If negativeEffectKills is true, after how many hours of exposure will the character die
     */
    negativeEffectKillsExposureHours: number;
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
     * Whether being naked (no clothes or accessories at all) makes the character fully protected from the weather system's effects
     * I mean it could be very hot weather right? :D
     */
    fullyProtectedNaked: boolean;
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
     * Whether being naked (no clothes or accessories at all) makes the character partially protected from the weather system's effects
     */
    partiallyProtectedNaked: boolean;
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
     * Whether being naked (no clothes or accessories at all) makes the character negatively affected by the weather system's effects
     */
    negativelyAffectedNaked: boolean;
    /**
     * Names of states that are applied to characters while they are fully exposed to the weather system
     * eg. "WET" for rain, "SUNBURNED" for sunny weather
     */
    applyingStatesDuringFullEffect: Array<string>;
    /**
     * Names of states that are applied to characters while they are partially exposed to the weather system
     * eg. "SLIGHTLY_WET" for rain, "SLIGHTLY_SUNBURNED" for sunny weather
     */
    applyingStatesDuringPartialEffect: Array<string>;
    /**
     * Names of states that are applied to characters while they are not exposed to the weather system
     * and fully sheltered from it
     */
    applyingStatesDuringNoEffect: Array<string>;
    /**
     * Names of states that are added if they are in a negative effect state and exposed to the weather system
     */
    applyingStatesDuringNegativeEffect: Array<string>;
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
    name: string;
    description: DEStringTemplate;
    maxHeightCm: number;
    maxWeightKg: number;
    maxVolumeLiters: number;
    isCurrentlyLocked: boolean;
    canHearFromInsideOutside: boolean;
    canBeUnlockedFromInside: boolean;
    /**
     * Use this for specifying other unlock conditions like keypads, biometric scanners, etc.
     * Even locksmithing attempts
     */
    otherUnlockConditions: Array<DEUnlockCondition>;
    canBeUnlockedByCharacters: Array<string>;
    canBeUnlockedByWithItem: Array<string>;
    autoLocksWhenClosed: boolean;
}

declare interface DELocationDefinition {
    description: DEStringTemplate;
    vehicleType?: string;
    vehicleVolumeLiters?: number;
    vehicleWeightKg?: number;
    vehicleHeightCm?: number;
    vehicleRangeMeters?: number;
    vehicleSpeedMetersPerSecond?: number;
    isSafe: boolean;
    isPrivate: boolean;
    isIndoors: boolean;
    maxHeightCm: number;
    maxWeightKg: number;
    maxVolumeLiters: number;
    properties: Record<string, any>;
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
    slots: Record<string, LocationSlot>;
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
     * Weather systems that only affect this location, if not specified the parent location
     * weather systems will apply here too
     */
    ownWeatherSystem: Array<WeatherSystem> | null;
    /**
     * Names of the characters that are spawned in this location with instantiable names
     * child connections will inherit these names
     */
    namePool?: NamePool;
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
}

declare interface DEConversationMessage {
    id: Readonly<string>;
    sender: string;
    isCharacter: boolean;
    isUser: boolean;
    isRejectedMessage: boolean;
    isSystemMessage: boolean;
    isDebugMessage: boolean;
    content: string;
    startTime: DETimeDescription;
    duration: DETimeDurationDescription;
    endTime: DETimeDescription;
    canOnlyBeSeenByCharacter: string | null;
}

declare interface DEConversation {
    id: Readonly<string>;
    /**
     * The list of participants of the conversation
     */
    participants: Array<string>;
    /**
     * The previous conversation IDs for each participant before this conversation started
     */
    previousConversationIdsPerParticipant: Record<string, string | null>;
    /**
     * The location where the conversation is happening
     */
    location: string;
    startTime: DETimeDescription;
    endTime: DETimeDescription | null;
    duration: DETimeDurationDescription;
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
     * An optonal short summary of the conversation and what happened in it
     * it should be available when it is a pseudoConversation
     * 
     * if one is not found, the LLM will be prompted to generate one
     * randomly
     */
    summary: string | null;
}

declare interface DEScript {
    type: "script";
    id: string;
    execute: (DE: DEObject, char: DECompleteCharacterReference) => void | Promise<void>;
}
declare interface DEScriptSource {
    id: string;
    source: string;
    type: "handlebars" | "javascript";
    run: (...args: any[]) => any;
}
declare type DEStringTemplateFunction = (
    DE: DEObject,
    char: DECompleteCharacterReference,
    other: DECompleteCharacterReference,
    causant: DECompleteCharacterReference,
    cause: string,
    potentialCausant: DECompleteCharacterReference,
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
}

declare interface DEUtils {
    newHandlebarsTemplate(id: string, source: string): DEStringTemplate;
    newTemplateFromFunction(id: string, func: DEStringTemplateFunction): DEStringTemplate;
    newLocationFromStaticDefinition(definition: DELocationDefinition): DEStatefulLocationDefinition;
    newWeatherSystem(definition: WeatherSystem): WeatherSystem;
}

declare interface DEObject {
    user: DEMinimalCharacterReference;
    characters: Record<string, DECompleteCharacterReference>;
    social: {
        bonds: Record<string, BondDescription>;
    };
    allNames: NamePool;
    worldNames: NamePool;
    stateFor: Record<string, StateForDescriptionWithHistory>;
    world: DEWorld;
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
    worldScripts: Array<DEScript>;
    /**
     * Scripts that run when any character spawns in the world
     * these run for every character that spawns including the user character
     * these run after the character spawn scripts
     */
    worldAllCharacterSpawnScripts: Array<DEScript>;
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
    worldRules: Array<DEStringTemplate>;
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
}

declare type DE = DEObject;
declare var DE: DEObject;
declare var char: DECompleteCharacterReference;
declare var other: DEMinimalCharacterReference;
declare var causant: DEMinimalCharacterReference;
declare var cause: string;