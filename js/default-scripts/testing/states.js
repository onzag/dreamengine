/**
 * Several silly states added to all characters in the world, for testing purposes
 */

engine.exports = {
    type: "character-mechanic",
    description: "Testing states added to all characters in the world, for testing purposes",
    initialize: async function (DE) {
        /**
         * @type {DECharacterStateDefinition}
         */
        const ACTS_LIKE_CHICKEN = {
            actionPromptInjection: {},
            behaviourType: "BINARY",
            conflictStates: [],
            dominance: 0,
            fallsDown: false,
            general: DE.utils.newHandlebarsTemplate(DE, "{{char}} will only act like a chicken and not speak or do anything else"),
            injuryAndDeath: false,
            intensityChangeRatePerInferenceCycle: 0,
            intensityModifiers: [],
            modifiesStatesIntensitiesOnTrigger: {},
            permanent: true,
            randomSpawnRate: 0,
            requiredStates: [],
            requiresCharacterCausants: false,
            requiresObjectCausants: false,
            requiresPosture: null,
            triggers: [
                {
                    intensity: 1,
                    template: DE.utils.newHandlebarsTemplate(DE, "has {{char}} mention the word egg?"),
                }
            ],
            triggersStates: {},

            __nonserialize: true,
        };

        /**
         * @type {DECharacterStateDefinition}
         */
        const LUNAR_STATION_SHOCK = {
            actionPromptInjection: {},
            behaviourType: "BINARY",
            conflictStates: [],
            dominance: 0,
            fallsDown: false,
            general: DE.utils.newHandlebarsTemplate(DE, "{{char}} will act shocked about being on a lunar station and will be preoccupied with thoughts about the moon and space exploration, often making comments about how they never expected to end up in such a place and how they are amazed by the view of Earth from the station."),
            injuryAndDeath: false,
            intensityChangeRatePerInferenceCycle: 0,
            intensityModifiers: [],
            modifiesStatesIntensitiesOnTrigger: {},
            permanent: true,
            randomSpawnRate: 0,
            requiredStates: [],
            requiresCharacterCausants: false,
            requiresObjectCausants: false,
            requiresPosture: null,
            triggers: [
                {
                    intensity: 1,
                    template: DE.utils.newHandlebarsTemplate(DE, "is {{char}} currently at a lunar station?"),
                }
            ],
            triggersStates: {},

            __nonserialize: true,
        };

        for (const characterName in DE.characters) {
            const character = DE.characters[characterName];
            character.states["Acts Like Chicken"] = ACTS_LIKE_CHICKEN;
            character.states["Having Lunar Station Shock"] = LUNAR_STATION_SHOCK;
        }
    }
}