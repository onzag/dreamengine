import { weightedRandomByLikelihood } from "../../util/random.js";
import { deepCopyNoHistory, DEngine } from "../index.js";
import { getHistoryFragmentForCharacter } from "../util/messages.js";
import { millisecondsToDuration, millisecondsToTime } from "../util/time.js";

/**
 * @param {DEngine} engine
 * @param {string} locationName
 * @param {DEStatefulLocationDefinition} location 
 * @param {DEStatefulLocationDefinition | null} parentLocation
 * @param {boolean} cascade
 */
export function rerollLocationWeather(engine, locationName, location, parentLocation, cascade = true) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    if (!location.ownWeatherSystem || location.ownWeatherSystem.length === 0) {
        if (parentLocation) {
            location.internalState.currentWeather = parentLocation.internalState.currentWeather;
            location.internalState.currentWeatherHasBeenOngoingFor = parentLocation.internalState.currentWeatherHasBeenOngoingFor;
            location.internalState.currentWeatherNoEffectDescription = parentLocation.internalState.currentWeatherNoEffectDescription;
            location.internalState.currentWeatherPartialEffectDescription = parentLocation.internalState.currentWeatherPartialEffectDescription;
            location.internalState.currentWeatherFullEffectDescription = parentLocation.internalState.currentWeatherFullEffectDescription;
            location.internalState.currentWeatherNegativelyExposedDescription = parentLocation.internalState.currentWeatherNegativelyExposedDescription;

            // find every children locations and reroll their weather
            if (cascade) {
                for (const potentialChildLocationKey in engine.deObject.world.locations) {
                    const potentialChildLocation = engine.deObject.world.locations[potentialChildLocationKey];
                    if (potentialChildLocation.parent === locationName) {
                        rerollLocationWeather(engine, potentialChildLocationKey, potentialChildLocation, location, true);
                    }
                }
            }
        } else {
            throw new Error("Location has no own weather system and no parent location to inherit weather from.");
        }
    } else {
        let shouldHaveNewWeather = false;
        const currentWeather = location.internalState.currentWeather;
        if (!currentWeather) {
            shouldHaveNewWeather = true;
        } else {
            const weatherDuration = location.internalState.currentWeatherHasBeenOngoingFor.inHours;
            const weatherSystemInfo = location.ownWeatherSystem.find(ws => ws.name === currentWeather);
            if (!weatherSystemInfo) {
                throw new Error(`Weather system info for current weather ${currentWeather} not found.`);
            }
            if (weatherDuration >= weatherSystemInfo.maxDurationInHours) {
                shouldHaveNewWeather = true;
            } else if (weatherDuration >= weatherSystemInfo.minDurationInHours) {
                const chanceToChange = (weatherDuration - weatherSystemInfo.minDurationInHours) / (weatherSystemInfo.maxDurationInHours - weatherSystemInfo.minDurationInHours);
                if (Math.random() < chanceToChange) {
                    shouldHaveNewWeather = true;
                }
            }
        }

        if (shouldHaveNewWeather) {
            // pick new weather
            const newWeatherSystem = weightedRandomByLikelihood(location.ownWeatherSystem);
            if (!newWeatherSystem) {
                throw new Error("Failed to pick new weather system. Are there any weather systems defined?");
            }
            location.internalState.currentWeather = newWeatherSystem.name;
            // TODO this needs to update when we reroll weather
            location.internalState.currentWeatherHasBeenOngoingFor = {
                inMinutes: 0,
                inHours: 0,
                inDays: 0,
                inSeconds: 0,
            };
            location.internalState.currentWeatherNoEffectDescription = newWeatherSystem.noEffectDescription;
            location.internalState.currentWeatherPartialEffectDescription = newWeatherSystem.partialEffectDescription;
            location.internalState.currentWeatherFullEffectDescription = newWeatherSystem.fullEffectDescription;
            location.internalState.currentWeatherNegativelyExposedDescription = newWeatherSystem.negativelyExposedDescription;

            // find every children locations and reroll their weather
            if (cascade) {
                for (const potentialChildLocationKey in engine.deObject.world.locations) {
                    const potentialChildLocation = engine.deObject.world.locations[potentialChildLocationKey];
                    if (potentialChildLocation.parent === locationName) {
                        rerollLocationWeather(engine, potentialChildLocationKey, potentialChildLocation, location, true);
                    }
                }
            }
        }
    }
}

/**
 * @param {DEngine} engine 
 */
export function rerollWorldWeather(engine) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    console.log("Rerolling world weather...");

    // find every top level location and reroll their weather
    for (const locationKey in engine.deObject.world.locations) {
        const location = engine.deObject.world.locations[locationKey];
        if (!location.parent) {
            rerollLocationWeather(engine, locationKey, location, null, true);
        }
    }
}

/**
 * @param {DEngine} engine 
 * @param {DETimeDurationDescription} timeForwards 
 */
function updateAllWeatherDurations(engine, timeForwards) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    /**
     * @param {DEStatefulLocationDefinition} location 
     */
    const updateWeatherForLocation = (location) => {
        if (location.internalState.currentWeatherHasBeenOngoingFor) {
            location.internalState.currentWeatherHasBeenOngoingFor.inMinutes += timeForwards.inMinutes;
            location.internalState.currentWeatherHasBeenOngoingFor.inHours += timeForwards.inHours;
            location.internalState.currentWeatherHasBeenOngoingFor.inDays += timeForwards.inDays;
            location.internalState.currentWeatherHasBeenOngoingFor.inSeconds += timeForwards.inSeconds;
        }
    }

    for (const locationKey in engine.deObject.world.locations) {
        const location = engine.deObject.world.locations[locationKey];
        updateWeatherForLocation(location);
    }
}

/**
 * 
 * @param {DEngine} engine 
 * @param {DETimeDescription} time 
 */
export function timeForwardsToNewTime(engine, time) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const currentTime = engine.deObject.currentTime;
    const msDiff = Math.abs(time.time - currentTime.time);

    engine.deObject.currentTime = time;

    const duration = millisecondsToDuration(msDiff);
    updateAllWeatherDurations(engine, duration);
    rerollWorldWeather(engine);

    for (const [charKey, charState] of Object.entries(engine.deObject.stateFor)) {
        const currentState = deepCopyNoHistory(charState);
        charState.time = { ...time };
        charState.history.push(currentState);
    }
}

/**
 * 
 * @param {DEngine} engine 
 * @param {DECompleteCharacterReference} character
 */
export default async function timeForwardsUsingLastMessage(engine, character) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    }

    const lastStoryFragment = (await getHistoryFragmentForCharacter(engine, character, {
        includeDebugMessages: false,
        includeRejectedMessages: false,
        msgLimit: "LAST_CYCLE",
    })).messages;

    const systemMessage = `You are an assistant and story analyst that helps determine how much time has passed in a story based the last story fragment.`;
    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
        "You must respond in the format, 'Time Passed: X', where X is the amount of time that has passed (e.g., '8 seconds', '5 minutes', '2 hours', '3 days', '1 week').",
        "Be realistic about how long actions take.",
        "Vary your estimates naturally - do not default to 1 of any unit. Consider the actual duration implied by the actions described, don't be afraid to estimate or guess if it is unclear and give variety in your responses.",
        "If the story fragment does not provide enough information to determine the time passed, give a rough estimate regardless.",
    ], null);
    const timePassedGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn("time-forwards", { system: systemPrompt, contextInfoBefore: null, messages: lastStoryFragment, contextInfoAfter: null, remarkLastStoryFragmentForAnalysis: true });

    const timePassedResponse = await timePassedGenerator.next();
    if (timePassedResponse.done) {
        throw new Error("Failed to prime time-forwards agent.");
    }

    const nextQuestion = `According to the last story fragment provided, how much time has passed?`;
    console.log("Asking question, " + nextQuestion);

    const answer = await timePassedGenerator.next({
        maxCharacters: 100,
        maxParagraphs: 1,
        maxSafetyCharacters: 100,
        nextQuestion: nextQuestion,
        stopAt: ["\n", "."],
        stopAfter: [],
        answerTrail: "Time Passed:\n\n",
        grammar: `root ::= NUMBER " " UNIT\nNUMBER ::= ([1-9] | [1-9] [0-9] | [1-9] [0-9] [0-9])\nUNIT ::= ("seconds" | "second" | "minutes" | "minute" | "hours" | "hour" | "days" | "day" | "weeks" | "week" | "month" | "months" | "year" | "years")`,
    });

    // Ensure the generator is properly closed.
    await timePassedGenerator.next(null);
    if (answer.done || !answer.value) {
        throw new Error("Failed to get a valid response from time-forwards agent.");
    }

    console.log("Received answer, " + answer.value.trim());

    // now we have to parse this time passed value, into milliseconds
    const timePassedText = answer.value.trim();
    const numberSide = parseInt(timePassedText.split(" ")[0], 10);

    let unitSide = timePassedText.split(" ")[1].toLowerCase();
    if (unitSide.endsWith("s")) {
        unitSide = unitSide.slice(0, -1);
    }

    const multMap = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000,
    };
    // @ts-ignore
    const multiplier = multMap[unitSide];
    if (!multiplier) {
        throw new Error(`Invalid time unit received from time-forwards agent: ${unitSide}`);
    }

    const totalMilliseconds = numberSide * multiplier;

    console.log(`Time-Forwards: Moving time forward by ${totalMilliseconds} milliseconds based on message from ${character.name}.`);

    const currentTime = engine.deObject.currentTime;

    // now let's advance the time
    currentTime.time += totalMilliseconds;

    const newCurrentTimeDate = new Date(currentTime.time);
    currentTime.dayOfMonth = newCurrentTimeDate.getUTCDate();
    currentTime.monthOfYear = newCurrentTimeDate.getUTCMonth() + 1;
    currentTime.year = newCurrentTimeDate.getUTCFullYear();
    currentTime.hourOfDay = newCurrentTimeDate.getUTCHours();
    currentTime.minuteOfHour = newCurrentTimeDate.getUTCMinutes();
    currentTime.dayOfWeek = newCurrentTimeDate.getUTCDay();

    // loop over the stateFor object, character key is the record key and value is the state
    for (const [charKey, charState] of Object.entries(engine.deObject.stateFor)) {
        const currentState = deepCopyNoHistory(charState);
        charState.time = { ...currentTime };
        charState.history.push(currentState);
    }

    for (const location of Object.values(engine.deObject.world.locations)) {
        location.internalState.currentWeatherHasBeenOngoingFor.inDays += totalMilliseconds / (24 * 60 * 60 * 1000);
        location.internalState.currentWeatherHasBeenOngoingFor.inHours += totalMilliseconds / (60 * 60 * 1000);
        location.internalState.currentWeatherHasBeenOngoingFor.inMinutes += totalMilliseconds / (60 * 1000);
    }

    const storyMasterMessagesToAdd = [];

    // reroll world weather
    const characterState = engine.deObject.stateFor[character.name];
    const currentWeatherAtLocation = engine.deObject.world.locations[characterState.location].internalState.currentWeather;

    const duration = millisecondsToDuration(totalMilliseconds);
    const timeNow = millisecondsToTime(currentTime.time);
    engine.deObject.currentTime = timeNow;

    updateAllWeatherDurations(engine, duration)
    rerollWorldWeather(engine);

    const newWeatherAtLocation = engine.deObject.world.locations[characterState.location].internalState.currentWeather;
    if (currentWeatherAtLocation !== newWeatherAtLocation) {
        console.log(`Time-Forwards: Weather at ${characterState.location} changed from ${currentWeatherAtLocation} to ${newWeatherAtLocation} after time advanced.`);
        storyMasterMessagesToAdd.push(`The weather at ${characterState.location} has changed from ${currentWeatherAtLocation} to ${newWeatherAtLocation}.`);
    }

    for (const message of lastStoryFragment) {
        if (!message.storyMaster) {
            if (message.conversationId && message.id) {
                const messageObj = engine.deObject.conversations[message.conversationId].messages.find(m => m.id === message.id);
                if (messageObj) {
                    messageObj.duration = duration;
                    messageObj.endTime = timeNow;
                }
            }
        }
    }

    return storyMasterMessagesToAdd;
}