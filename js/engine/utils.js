import Handlebars from "handlebars";

/**
 * @type {DEUtils}
 */
export const deEngineUtils = {
    newHandlebarsTemplate(DE, source) {
        const compiled = Handlebars.compile(source);
        return (DE, info) => {
            const obj = {
                user: DE.user.name,
                char: info.char?.name || "",
                other: info.other?.name || "",
                causants: info.causants?.map(c => c.name) || [],
                potential_causant: info.potentialCausant || "",
                potential_causants: info.potentialCausants?.map(c => c.name) || [],
            };
            Object.keys(DE.functions).forEach((key) => {
                // @ts-ignore
                if (!obj[key]) {
                    // @ts-ignore
                    obj[key] = (...args) => {
                        // @ts-ignore
                        return DE.functions[key](DE, info.char, ...args);
                    };
                }
            });
            return compiled(obj);
        }
    },
    newLocationFromStaticDefinition(DE, locationDef) {
        /**
         * @type {DEStatefulLocationDefinition}
         */
        const statefulLocation = {
            ...locationDef,

            // @ts-ignore
            currentWeather: null,
            // @ts-ignore
            currentWeatherFullEffectDescription: null,
            // @ts-ignore
            currentWeatherHasBeenOngoingFor: null,
            // @ts-ignore
            currentWeatherNoEffectDescription: null,
            // @ts-ignore
            currentWeatherPartialEffectDescription: null,
        }

        if (locationDef.parent === null) return statefulLocation;

        const parentLocation = DE.world.locations[locationDef.parent];
        if (!parentLocation) {
            throw new Error(`Parent location with name ${locationDef.parent} not found`);
        }

        // copy weather from parent
        if (!locationDef.ownWeatherSystem) {
            statefulLocation.currentWeather = parentLocation.currentWeather;
            statefulLocation.currentWeatherFullEffectDescription = parentLocation.currentWeatherFullEffectDescription;
            statefulLocation.currentWeatherHasBeenOngoingFor = parentLocation.currentWeatherHasBeenOngoingFor;
            statefulLocation.currentWeatherNoEffectDescription = parentLocation.currentWeatherNoEffectDescription;
            statefulLocation.currentWeatherPartialEffectDescription = parentLocation.currentWeatherPartialEffectDescription;
        }

        return statefulLocation;
    },
    newWeatherSystem(DE, weatherSystemDef) {
        return weatherSystemDef;
    },
};