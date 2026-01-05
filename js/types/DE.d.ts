declare interface MinimalCharacterReference {
    name: Readonly<string>;
    sex: "male" | "female" | "intersex";
    gender: "male" | "female" | "ambiguous";
    heightCm: number;
    shortDescription: string;
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
    triggersStates: string[];
    relievesStates: string[];
    triggersStatesOnRelieve: string[];
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
    manualTriggers: Array<DEStringTemplate>;
    manualRelievers: Array<DEStringTemplate>;
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

declare interface CompleteCharacterReference extends MinimalCharacterReference {
    properties?: Record<string, any>;
    injectableInGeneralText?: Record<string, DEStringTemplate>;
    injectableInStateTextBefore?: Record<string, DEStringTemplate>;
    injectableInStateTextAfter?: Record<string, DEStringTemplate>;
    general?: DEStringTemplate;
    initiative?: number;
    strangerInitiative?: number;
    strangerRejection?: number;
    autisticResponse?: number;
    schizophrenia?: number;
    states?: Record<string, CharacterStateDefinition>;
    bonds?: Array<BondDeclaration>;
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
}

declare interface WeatherSystem {
    name: string;
    likelyhood: number;
    fullEffectDescription: DEStringTemplate;
    partialEffectDescription: DEStringTemplate;
}

declare interface LocationDefinition {
    id: string;
    name: string;
    description: DEStringTemplate;
    isVehicle: boolean;
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
    shelterFullyBlocksWeather: Array<string>;
    shelterPartiallyBlocksWeather: Array<string>;
    ownWeatherSystem: Array<string> | null;

    currentWeather: string;
    currentWeatherFullEffectDescription: DEStringTemplate;
    currentWeatherPartialEffectDescription: DEStringTemplate;
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
declare type DEStringTemplate = (DE: DEObject) => string;
declare type DEPotentiallyNullReturningStringTemplate = (DE: DEObject) => string | null;

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