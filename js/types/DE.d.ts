declare interface MinimalCharacterReference {
    name: Readonly<string>;
    sex: "male" | "female" | "intersex";
    gender: "male" | "female" | "ambiguous";
    heightCm: number;
    shortDescription: string;
}

interface DEStringTemplateWithIntensity {
    template: DEStringTemplate;
    intensity: number;
}

declare interface CharacterStateDefinition {
    general: DEStringTemplate;
    relieving: DEStringTemplate;
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
    automaticTrigger: boolean
    automaticRelieve: boolean;
    decayRatePerInferenceCycle: number;
    manualTriggerLikelihood: number;
    manualTriggers: Array<DEStringTemplateWithIntensity>;
    manualIntensifiers: Array<DEStringTemplateWithIntensity>;
    manualRelievers: Array<DEStringTemplateWithIntensity>;
    binaryBehaviour: boolean;
    startingIntensity: 0 | 1 | 2 | 3 | 4;
    bondMini: boolean;
    reliefUsesDecayRate: boolean;
    decayRateAfterRelief: number;
    permanent: boolean;
    injuryAndDeath: boolean;
    trackCausants: boolean;
    trackCause: boolean;
}

declare interface BondDeclaration {
    minBondLevel: number;
    maxBondLevel: number;
    min2BondLevel: number;
    max2BondLevel: number;
    description: DEStringTemplate;
    bondConditions: {
        increaseIf: Array<DEPotentiallyNullReturningStringTemplate | string>;
        decreaseIf: Array<DEPotentiallyNullReturningStringTemplate | string>;
    }
    secondBondConditions: {
        increaseIf: Array<DEPotentiallyNullReturningStringTemplate | string>;
        decreaseIf: Array<DEPotentiallyNullReturningStringTemplate | string>;
    }
}

declare interface EmotionDefinition {
    common: boolean;
    triggeredByStates: string[];
}

declare type DEPropertyValueGetter = (DE: DEObject, char: CompleteCharacterReference) => any;

declare interface DEPropertyValue {
    value: DEPropertyValueGetter;
}

// confronted 

declare interface CompleteCharacterReference extends MinimalCharacterReference {
    properties: Record<string, DEPropertyValue>;
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
    emotions?: Record<string, EmotionDefinition>;
}

declare interface NamePool {
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
}

declare interface TimeDescription {
    time: number;
    hourOfDay: number;
    dayOfWeek: number;
    dayOfMonth: number;
    monthOfYear: number;
    year: number;
}

declare interface TimeDurationDescription {
    inMinutes: number;
    inHours: number;
    inDays: number;
}

declare interface StateForDescription {
    id: string;
    location: string;
    slot: number;
    states: Array<StateDescription>;
    type: "INTERACTING" | "BACKGROUND";
    time: TimeDescription;
    conversationId: string | null;
    messageId: string | null;
    surroundingNonStrangers: Array<string>;
    surroundingStrangers: Array<string>;
    partiallyExposedToWeather: string | null;
    fullyExposedToWeather: string | null;
}

declare interface StateForDescriptionWithHistory extends StateForDescription {
    history: Array<StateForDescription>;
    dead: boolean;
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
     * Duration of the weather system in hours on average
     */
    usualDurationInHours: number;
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

declare interface LocationDefinition {
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

    // STATEFUL PROPERTIES
    /**
     * The current weather system affecting this location
     * children of this location will have the same weather unless they have their own weather system
     */
    currentWeather: string;
    /**
     * How long the current weather has been ongoing for
     */
    currentWeatherHasBeenOngoingFor: TimeDurationDescription;
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
     * Names of the characters that are spawned in this location with instantiable names
     * child connections will inherit these names
     */
    locationNames?: NamePool;
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
    time: TimeDescription;
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
    startTime: TimeDescription;
    endTime: TimeDescription;
    isOngoing: boolean;
    duration: TimeDurationDescription;
    /**
     * The list of messages that were exchanged in the conversation
     */
    messages?: Array<DEConversationMessage>;
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
    execute: () => void | Promise<void>;
}
declare type DEStringTemplate = (DE: DEObject, char: CompleteCharacterReference) => Promise<string> | string;
declare type DEPotentiallyNullReturningStringTemplate = (DE: DEObject, char: CompleteCharacterReference) => Promise<string | null> | string | null;

declare interface DEObject {
    user: MinimalCharacterReference;
    characters: Record<string, CompleteCharacterReference>;
    social: {
        everyone: Array<string>;
        bonds: Record<string, BondDescription>;
    };
    allNames: NamePool;
    worldNames?: NamePool;
    stateFor: Record<string, StateForDescriptionWithHistory>;
    world: {
        currentLocation: string;
        locations: Array<LocationDefinition>;
    };
    scripts: {
        spawn: Array<DEScript>;
        preStateCheck: Array<DEScript>;
        preInference: Array<DEScript>;
        firstInteract: Array<DEScript>;
        postInference: Array<DEScript>;
        postAnyInference: Array<DEScript>;
    };
    conversations: Record<string, DEConversation>;
}

declare type DE = DEObject;
declare var DE: DEObject;
declare var char: CompleteCharacterReference;
declare var other: MinimalCharacterReference;
declare var causant: MinimalCharacterReference;
declare var cause: string;