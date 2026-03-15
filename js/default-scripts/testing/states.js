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
            seeksPosture: null,
            triggers: [
                {
                    intensity: 1,
                    template: DE.utils.newHandlebarsTemplate(DE, "has {{char}} mention the word egg?"),
                }
            ],
            triggersStates: {},

            __nonserialize: true,
        };

        for (const characterName in DE.characters) {
            const character = DE.characters[characterName];
            character.states.ACTS_LIKE_CHICKEN = ACTS_LIKE_CHICKEN;
        }
    }
}