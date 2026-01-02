declare interface MinimalCharacterReference {
    name: Readonly<string>;
    sex: "male" | "female" | "intersex";
    gender: "male" | "female" | "ambiguous";
    heightCm: number;
    shortDescription: string;
}

declare type StringTemplate = (DE: DEObject) => string;
declare type PotentiallyNullReturningStringTemplate = (DE: DEObject) => string | null;

declare interface CharacterStateDefinition {
    general: StringTemplate;
    relieving: StringTemplate;
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
    potentialCausantNegativeDescription: StringTemplate;
    potentialCausantPositiveDescription: StringTemplate;
    potentialCausantMinBondRequired: number;
    potentialCausantMaxBondAllowed: number;
    potentialCausantMin2BondRequired: number;
    potentialCausantMax2BondAllowed: number;
    automaticTrigger: boolean
    automaticRelieve: boolean;
    decayRatePerInferenceCycle: number;
    manualTriggerLikelihood: number;
    manualTriggers: Array<StringTemplate>;
    manualRelievers: Array<StringTemplate>;
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
    description: StringTemplate;
    bondConditions: {
        increaseIf: Array<PotentiallyNullReturningStringTemplate | string>;
        decreaseIf: Array<PotentiallyNullReturningStringTemplate | string>;
    }
    secondBondConditions: {
        increaseIf: Array<PotentiallyNullReturningStringTemplate | string>;
        decreaseIf: Array<PotentiallyNullReturningStringTemplate | string>;
    }
}

declare interface EmotionDefinition {
    common: boolean;
    triggeredByStates: string[];
}

declare interface CompleteCharacterReference extends MinimalCharacterReference {
    properties?: Record<string, any>;
    injectableInGeneralText?: Record<string, StringTemplate>;
    injectableInStateTextBefore?: Record<string, StringTemplate>;
    injectableInStateTextAfter?: Record<string, StringTemplate>;
    general?: StringTemplate;
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
    bond: number;
    bond2: number;
}

declare interface BondDescription {
    active: Array<SingleBondDescription>;
    ex: Array<SingleBondDescription>;
}

declare interface StateDescription {
    state: string;
    intensity: number;
    causants: Array<string> | null;
    causes: Array<string> | null;
}

declare interface TimeDescription {
    time: number;
    hourOfDay: number;
    dayOfWeek: number;
    dayOfMonth: number;
    monthOfYear: number;
    year: number;
}

declare interface StateForDescription {
    location: string;
    slot: number;
    states: Array<StateDescription>;
    type: "INTERACTING" | "BACKGROUND";
    time: TimeDescription;
    conversationId: string | null;
}

declare interface StateForDescriptionWithHistory extends StateForDescription {
    history: Array<StateForDescription>;
}

declare interface LocationSlot {
    name: string;
    description: StringTemplate;
    isRestingSpot: boolean;
    isLayingDownSpot: boolean;
}

declare interface WeatherSystem {
    name: string;
    likelyhood: number;
    fullEffectDescription: StringTemplate;
    partialEffectDescription: StringTemplate;
}

declare interface LocationDefinition {
    id: string;
    name: string;
    description: StringTemplate;
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
    unlockConditions: Array<StringTemplate>;
    slots: Array<LocationSlot>;
    shelterFullyBlocksWeather: Array<string>;
    shelterPartiallyBlocksWeather: Array<string>;
    ownWeatherSystem: Array<string> | null;

    currentWeather: string;
    currentWeatherFullEffectDescription: StringTemplate;
    currentWeatherPartialEffectDescription: StringTemplate;
}

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
    }
}