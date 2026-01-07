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
    template: DEStringTemplate;
    intensity: number;
}

declare interface CharacterStateDefinition {
    dominance: number;
    general: DEStringTemplate;
    systemPromptInjection: DEStringTemplate | null;
    userPromptInjection: DEStringTemplate | null;
    relieving: DEStringTemplate | null;
    relievingSystemPromptInjection: DEStringTemplate | null;
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
    bondMini: boolean;
    reliefUsesDecayRate: boolean;
    decayRateAfterRelief: number;
    permanent: boolean;
    injuryAndDeath: boolean;
    trackCausants: boolean;
    trackCause: boolean;
}

declare interface BondIncreaseQuestion {
    question_increase: DEPotentiallyNullReturningStringTemplate;
    question_decrease: DEPotentiallyNullReturningStringTemplate;
    increase_weight: number;
    decrease_weight: number;
}

declare interface BondDeclaration {
    minBondLevel: number;
    maxBondLevel: number;
    min2BondLevel: number;
    max2BondLevel: number;
    description: DEStringTemplate;
    bondConditions: {
        increaseQuestions: Array<BondIncreaseQuestion>;
        decreaseQuestions: Array<BondIncreaseQuestion>;
    }
    secondBondConditions: {
        increaseQuestions: Array<BondIncreaseQuestion>;
        decreaseQuestions: Array<BondIncreaseQuestion>;
    }
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
    value: DEPropertyValueGetterInCharSpace;
}

declare type DEPropertyValueGetter = (DE: DEObject) => any;

declare interface DEPropertyValue {
    value: DEPropertyValueGetter;
}

declare type DEPropertyValueGetterInItemSpace = (DE: DEObject, item: DEItem) => any;

declare interface DEPropertyValueInItemSpace {
    value: DEPropertyValueGetterInItemSpace;
}



// confronted 

declare interface DECompleteCharacterReference extends DEMinimalCharacterReference {
    properties: Record<string, DEPropertyValueInCharSpace>;
    injectableInGeneralText: Record<string, DEStringTemplate>;
    injectableInStateTextBefore: Record<string, DEStringTemplate>;
    injectableInStateTextAfter: Record<string, DEStringTemplate>;
    general: DEStringTemplate;
    initiative: number;
    strangerInitiative: number;
    strangerRejection: number;
    autisticResponse: number;
    schizophrenia: number;
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
    compartimentName: string | null;
    isSeeThrough: boolean;
    properties: Record<string, DEPropertyValue>;
    isClothing: boolean;
    isFoodOrWater: boolean;
    clothingProperties: {
        type: string;
        canBeWornByCharactersWithStates: Array<string>;
        canBeWornByCharactersWithProperties: Array<string>;
        incompatibleWith: Array<string>;
        wearerMinHeightCm: number | null;
        wearerMaxHeightCm: number | null;
        wearerMinWeightKg: number | null;
        wearerMaxWeightKg: number | null;
    } | null;
    foodProperties: {
        calories: number;
        hydrationLiters: number;
    } | null;
    containing: Array<DEItem>;
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
    carrying: DEItem[];
    wearing: DEItem[];
}

declare interface StateForDescriptionWithHistory extends StateForDescription {
    history: Array<StateForDescription>;
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

declare interface LocationSlot {
    name: string;
    description: DEStringTemplate;
    isRestingSpot: boolean;
    isLayingDownSpot: boolean;
    isVehicleSpot: boolean;
    vehicularVolumeCapacity: number | null;
    vehicleTypeLimitations: Array<string>;
    /**
     * Names of weather systems that are fully blocked by this slot
     */
    slotFullyBlocksWeather: Array<string>;
    /**
     * Names of weather systems that are only partially blocked by this slot
     */
    slotPartiallyBlocksWeather: Array<string>;
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
    sender: string;
    isCharacter: boolean;
    isUser: boolean;
    isUserRejectedMessage: boolean;
    isSystemMessage: boolean;
    isHiddenSystemMessage: boolean;
    isSchizophrenicVoice: boolean;
    schizophrenicVoiceSourceCharacter: string | null;
    time: DETimeDescription;
    content: string;
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
    endTime: DETimeDescription;
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
    summary?: string;
}

declare interface DEScript {
    name: string;
    execute: (DE: DEObject, char: DECompleteCharacterReference) => void | Promise<void>;
}
declare type DEStringTemplate = (DE: DEObject, char: DECompleteCharacterReference) => Promise<string> | string;
declare type DEPotentiallyNullReturningStringTemplate = (DE: DEObject, char: DECompleteCharacterReference) => Promise<string | null> | string | null;

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
}

declare type DE = DEObject;
declare var DE: DEObject;
declare var char: DECompleteCharacterReference;
declare var other: DEMinimalCharacterReference;
declare var causant: DEMinimalCharacterReference;
declare var cause: string;

// RAW types below used to create the DEObject

declare interface DERawWorldDefinition {

}