declare interface DEMinimalCharacterReference {
    name: Readonly<string>;
    sex: "male" | "female" | "intersex";
    gender: "male" | "female" | "ambiguous";
    heightCm: number;
    weightKg: number;
    carryingCapacityLiters: number;
    carryingCapacityKg: number;
    shortDescription: string;
}

interface DEStringTemplateWithIntensity {
    /**
     * Relevant template in question
     */
    template: DEStringTemplate;
    /**
     * Intensity of the template effect
     */
    intensity: number;
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
    systemPromptInjection: DEStringTemplate | null;
    /**
     * Very strong, used for instructions that the character must follow
     * make sure that it is not kept every inference cycle unless intended
     * as the character will be forced to follow it no matter what
     * you may use a randomizing function to return an empty string sometimes
     * to avoid the character being stuck in a loop of following the same instruction
     * or you may choose to give different instructions each time
     * 
     * Setting the user prompt injection will disable reasoning in the character about
     * what they will do next as they will be forced to follow the instructions
     * 
     * If two injections are set at the same time by different states, the one from the state with higher dominance will take precedence,
     * if they have the same dominance, one will be chosen at random
     */
    userPromptInjection: DEStringTemplate | null;
    /**
     * Description of the state, used for reasoning about the state
     */
    relieving: DEStringTemplate | null;
    /**
     * Used for descriptions of the character general state
     * get applied at system prompt level when relieving the state
     */
    relievingSystemPromptInjection: DEStringTemplate | null;
    /**
     * Very strong, used for instructions that the character must follow
     * make sure that it is not kept every inference cycle unless intended
     * as the character will be forced to follow it no matter what
     * you may use a randomizing function to return an empty string sometimes
     * to avoid the character being stuck in a loop of following the same instruction
     * or you may choose to give different instructions each time
     * 
     * Setting the user prompt injection will disable reasoning in the character about
     * what they will do next as they will be forced to follow the instructions
     * 
     * If two injections are set at the same time by different states, the one from the state with higher dominance will take precedence,
     * if they have the same dominance, one will be chosen at random
     */
    relievingUserPromptInjection: DEStringTemplate | null;
    triggersDeadEnd: string;
    deadEndIsDeath: boolean;
    triggersDeadEndRandomChance: number;
    triggersDeadEndWhileRelievingRandomChance: number;
    commonState: boolean;
    hasCustomViewables: boolean;
    customViewablesPriority: number;
    laysDownState: boolean;
    laysDownStateIsSuddenOnset: boolean;
    restsState: boolean;
    randomSpawnRate: number;
    conflictStates: string[];
    requiredStates: string[];
    triggersStates: {[stateName: string]: {intensity: number}};
    relievesStates: {[stateName: string]: {intensity: number}};
    triggersStatesOnRelieve: {[stateName: string]: {intensity: number}};
    potentialCausantNegativeDescription: DEStringTemplate;
    potentialCausantPositiveDescription: DEStringTemplate;
    potentialCausantMinBondRequired: number;
    potentialCausantMaxBondAllowed: number;
    potentialCausantMin2BondRequired: number;
    potentialCausantMax2BondAllowed: number;
    decayRatePerInferenceCycle: number;
    triggerLikelihood: number;
    triggers: Array<DEStringTemplateWithIntensity>;
    intensifiers: Array<DEStringTemplateWithIntensity>;
    relievers: Array<DEStringTemplateWithIntensity>;
    binaryBehaviour: boolean;
    reliefUsesDecayRate: boolean;
    decayRateAfterRelief: number;
    permanent: boolean;
    injuryAndDeath: boolean;
    trackCausants: boolean;
    trackCause: boolean;
}

declare interface BondIncreaseQuestion {
    questionIncrease: DEStringTemplate | null;
    questionDecrease: DEStringTemplate | null;
    increaseFromStateWithCausant: string | null;
    decreaseFromStateWithCausant: string | null;
    increaseWeight: number;
    decreaseWeight: number;
}

declare interface BondDeclaration {
    minBondLevel: number;
    maxBondLevel: number;
    min2BondLevel: number;
    max2BondLevel: number;
    description: DEStringTemplate;
    bondConditions: BondIncreaseQuestion[];
    secondBondConditions: BondIncreaseQuestion[];
}

declare interface DEAssetLocationAndPlacement {
    filePath: string;
    scale: number;
    offsetX: number;
    offsetY: number;
}

declare interface DEAssetInfo {
    assets: Array<DEAssetLocationAndPlacement>;
    type: string;
}

declare type DEAssetDeclaration = (DE: DEObject, char: DECompleteCharacterReference) => DEAssetInfo;

declare interface DEEmotionDefinition {
    common: boolean;
    triggeredByStates: string[];
    asset: DEEmotionAssetDeclaration;
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
}



// confronted 

declare interface DECompleteCharacterReference extends DEMinimalCharacterReference {
    properties: Record<string, DEPropertyValueInCharSpace>;
    injectableInGeneralText: Record<string, DEStringTemplate>;
    injectableInReasoningTextBefore: Record<string, DEStringTemplate>;
    injectableInReasoningTextAfter: Record<string, DEStringTemplate>;

    /**
     * These are similar to user prompt injections in the state but they don't need any
     * state, use them with caution as they will override the character's reasoning every inference cycle
     * they are intended for temporary use during specific scenarios, and these don't even have a state
     * condition to be applied, they will just be applied as long as they are set
     * 
     * They will get overridden by state-based user prompt injections if those are present
     * since the ones here are for general purposes and may conflict with state-based ones
     * 
     * These will override reasoning just like state-based user prompt injections do
     */
    injectableInUserPrompt: Record<string, DEStringTemplate>;
    general: DEStringTemplate;
    initiative: number;
    strangerInitiative: number;
    strangerRejection: number;
    autisticResponse: number;
    schizophrenia: number;
    schizophrenicVoiceDescription: DEStringTemplate | null;
    states: Record<string, CharacterStateDefinition>;
    bonds: Array<BondDeclaration>;
    emotions: Record<string, EmotionDefinition>;
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
    properties: Record<string, DEPropertyValue>;
    isConsumable: boolean;
    foodProperties: {
        calories: number;
        hydrationLiters: number;
    } | null;
    containing: Array<DEItem>;
    amount: number;

    /**
     * The placement of the item in the location or on the character
     * or within the container item
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
     * The item the character is using to sit, stand or lay down on or null if none
     * if none that means the character is using the ground/floor/etc
     */
    postureAppliedOn: DEItem | null;
    carrying: DEItem[];
    carryingCharacters: Array<string>;
    wearing: DEItem[];
    beingCarriedByCharacter: string | null;
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
    name: string;
    description: DEStringTemplate;
    /**
     * Maximum vehicular volume capacity in liters for vehicles parked in this slot
     * Make it null for no vehicle capacity
     */
    vehicularVolumeCapacity: number | null;
    /**
     * Types of vehicles that can be parked in this slot
     */
    vehicleTypeLimitations: Array<string> | null;
    /**
     * Names of weather systems that are fully blocked by this slot
     */
    slotFullyBlocksWeather: Array<string> | null;
    /**
     * Names of weather systems that are only partially blocked by this slot
     */
    slotPartiallyBlocksWeather: Array<string> | null;
    items: Array<DEItem>;
}

declare interface WeatherSystem {
    /**
     * Name of the weather system, eg. "Rain", "Sunny", "Snow"
     */
    name: string;
    /**
     * Sum of these likelihoods should be 1 for all weather systems in a location
     */
    likelyhood: number;
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
     * If a character is in this state, they are partially protected from the weather system's effects
     * eg. "HOLDING_UMBRELLA" "WEARING_LIGHT_JACKET"
     */
    partiallyProtectingStates: Array<string>;
    /**
     * If a character is in this state, they are negatively affected by the weather system's effects
     * eg. "SICK" "NAKED" "INJURED"
     */
    negativelyAffectingStates: Array<string>;
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

declare interface DELocationDefinition {
    id: string;
    name: string;
    description: DEStringTemplate;
    isVehicle: boolean;
    vehicleType: string | null;
    vehicleVolume: number;
    isSafe: boolean;
    isPrivate: boolean;
    isIndoors: boolean;
    level: number;
    properties: Record<string, any>;
    connections: Record<string, number>;
    parentConnection: string | null;
    isCurrentlyLocked: boolean;
    canBeUnlockedFromInside: boolean;
    unlockConditions: Array<DEStringTemplate>;
    canBeUnlockedByCharactersWithStates: Array<string>;
    canBeUnlockedByCharactersWithProperties: Array<string>;
    slots: Array<LocationSlot>;
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
     * Description of the current weather's full effects on this location
     * will override the general weather full effect description if present
     */
    locationWeatherFullEffectDescription: DEStringTemplate | null;
    /**
     * Description of the current weather's partial effects on this location
     * will override the general weather partial effect description if present
     */
    locationWeatherPartialEffectDescription: DEStringTemplate | null;
    /**
     * Description when there is no weather effect on this location, aka is fully sheltered
     * will override the general weather no effect description if present
     */
    locationWeatherNoEffectDescription: DEStringTemplate | null;
    /**
     * Names of the characters that are spawned in this location with instantiable names
     * child connections will inherit these names
     */
    locationNames?: NamePool;
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
    sender: string | null;
    isCharacter: boolean;
    isUser: boolean;
    isUserRejectedMessage: boolean;
    isSystemMessage: boolean;
    isHiddenSystemMessage: boolean;
    isInternalStateMessage: boolean;
    isSchizophrenicVoice: boolean;
    content: string;
    startTime: DETimeDescription;
    duration: DETimeDurationDescription;
    endTime: DETimeDescription;
}

declare interface DEConversation {
    id: Readonly<string>;
    /**
     * The list oc current participants of the conversation
     */
    participants: Array<string>;
    /**
     * Names of the characters that have left the conversation while it was happening
     */
    leavers: Array<string>;
    /**
     * Names of the characters that have joined the conversation
     * while it was happening and may not have full context
     */
    joiners: Array<string>;
    /**
     * The location where the conversation is happening
     */
    location: string;
    startTime: DETimeDescription;
    endTime: DETimeDescription | null;
    isOngoing: boolean;
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
    type: "handlebars" | "typescript";
}
declare type DEStringTemplateFunction = (DE: DEObject, char: DECompleteCharacterReference) => Promise<string> | string;
declare type DEStringTemplate = DEStringTemplateFunction |{
    type: "template";
    id: string;
    execute: DEStringTemplateFunction;
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
    world: {
        currentLocation: string;
        currentLocationSlot: string;
        locations: Array<DEStatefulLocationDefinition>;
    };
    conversations: Record<string, DEConversation>;
    functions: FunctionTypes;
    initialTime: DETimeDescription;
    currentTime: DETimeDescription;
    scriptSources: DEScriptSource[];
    userWorldRules: Array<DEStringTemplate>;
}

declare type DE = DEObject;
declare var DE: DEObject;
declare var char: DECompleteCharacterReference;
declare var other: DEMinimalCharacterReference;
declare var causant: DEMinimalCharacterReference;
declare var cause: string;