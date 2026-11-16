import { weightedRandomByLikelihood } from "../../util/random.js";
import { deepCopyNoHistory, DEngine } from "../index.js";
import { convertMessagesToSimpleList, getHistoryFragment } from "../util/messages.js";
import { millisecondsToDuration, millisecondsToTime } from "../util/time.js";
import { debug } from "../debug.js";

/**
 * @param {DEngine} engine
 * @param {string} locationName
 * @param {DEStatefulLocation} location 
 * @param {DEStatefulLocation | null} parentLocation
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
            location.internalState.currentWeatherHasBeenOngoingFor = {
                inMinutes: 0,
                inHours: 0,
                inDays: 0,
                inSeconds: 0,
            };

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
     * @param {DEStatefulLocation} location 
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
export async function timeForwardsToNewTime(engine, time) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }

    const currentTime = engine.deObject.currentTime;
    const msDiff = Math.abs(time.time - currentTime.time);

    engine.deObject.currentTime = time;

    const duration = millisecondsToDuration(msDiff);
    updateAllWeatherDurations(engine, duration);
    rerollWorldWeather(engine);

    await engine.deObject.database.timeUntimedConversationMessages(time);
}

/**
 * @param {DEngine} engine 
 */
export default async function timeForwardsUsingUntimedMessages(engine) {
    if (!engine.deObject) {
        throw new Error("DEngine not initialized");
    }
    if (!engine.inferenceAdapter) {
        throw new Error("Inference adapter not initialized");
    }

    if (!debug.ENABLED_TIME_FORWARD) {
        return [];
    }

    const userCharacter = engine.deObject.characters[engine.deObject.user];

    if (!userCharacter) {
        throw new Error("User character not found in engine.deObject.characters");
    }

    // now this function is meant to be called every time a character sends a message and ends their talk turn
    // or when the story starts (and since the character shouldn't have spoken yet it will get everything since the beginning of time)
    const untimedFragements = (await getHistoryFragment(engine, userCharacter, {
        includeDebugMessages: false,
        includeRejectedMessages: false,
        msgLimit: "ALL_UNTIMED_MESSAGES_UNTIL_FIRST_TIMED_MESSAGE",
        perspective: "story-master",
    })).messages;

    const systemMessage = `You are an assistant and story analyst that estimates the elapsed time covered by the provided untimed story fragments.`;
    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
        "You must respond in the format, 'Time Passed: X', where X is the amount of time that has passed (e.g., '8 seconds', '5 minutes', '2 hours', '3 days', '1 week').",
        "Estimate the total elapsed time across all provided untimed fragments. Background descriptions establish context and do not imply additional elapsed time unless an action or time jump actually occurs.",
        "Account for the time needed to speak dialogue aloud: use roughly 2 to 3 spoken words per second, plus pauses, gasps, and other actions. A multiword sentence normally takes several seconds, not 1 second. Do not count speaker labels, formatting tags, or narration as spoken words.",
        "Add durations for sequential actions. For simultaneous actions, count their overlapping time only once. Respect explicit durations and time jumps in the story.",
        "Choose a realistic whole-number duration based on the events, rather than choosing 1 by default or varying the answer arbitrarily. A single brief sound or instantaneous action can take 1 second.",
        "If the story fragment does not provide enough information to determine the time passed, give a rough estimate regardless.",
    ], null);
    const timePassedGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(
        "time-forwards",
        {
            system: systemPrompt,
            contextInfoBefore: null,
            messages: convertMessagesToSimpleList(untimedFragements),
            contextInfoAfter: null,
        }
    );

    const timePassedResponse = await timePassedGenerator.next();
    if (timePassedResponse.done) {
        throw new Error("Failed to prime time-forwards agent.");
    }

    const nextQuestion = `How much time elapsed across these untimed story fragments, including the time needed to speak the dialogue and perform the actions? Complete the Time Passed answer with only a whole number and its time unit.`;

    const answer = await timePassedGenerator.next({
        maxCharacters: 100,
        maxParagraphs: 1,
        maxSafetyCharacters: 100,
        nextQuestion: nextQuestion,
        stopAt: ["\n", "."],
        stopAfter: [],
        answerTrail: "Time Passed: ",
        grammar: `root ::= NUMBER " " UNIT\nNUMBER ::= ([1-9] | [1-9] [0-9] | [1-9] [0-9] [0-9])\nUNIT ::= ("seconds" | "second" | "minutes" | "minute" | "hours" | "hour" | "days" | "day" | "weeks" | "week" | "month" | "months" | "year" | "years")`,
    });

    // Ensure the generator is properly closed.
    await timePassedGenerator.next(null);
    if (answer.done || !answer.value || !answer.value.text) {
        throw new Error("Failed to get a valid response from time-forwards agent.");
    }

    console.log(untimedFragements);
    console.log(`Time-Forwards: Time passed response from time-forwards agent: ${answer.value.text.trim()}`);

    // now we have to parse this time passed value, into milliseconds
    const timePassedText = answer.value.text.trim();
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

    console.log(`Time-Forwards: Moving time forward by ${totalMilliseconds} milliseconds based on untimed messages.`);

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

    const storyMasterMessagesToAdd = [];

    // reroll world weather
    const characterState = engine.deObject.stateFor[userCharacter.id];
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

    await engine.deObject.database.timeUntimedConversationMessages(timeNow);

    return storyMasterMessagesToAdd;
}
