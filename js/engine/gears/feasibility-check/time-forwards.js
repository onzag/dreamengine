import { deepCopyNoHistory, DEngine } from "../../index.js";

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

    const messageHistoryGenerator = engine.getHistoryForCharacter(character, { includeDebugMessages: false, includeRejectedMessages: false });
    /**
     * @type {string|null}
     */
    let message = null;
    let generator = await messageHistoryGenerator.next(true);
    while (!generator.done) {
        if (!generator.value.debug && !generator.value.rejected) {
            const shouldStopAddingMessages = generator.value.name === character.name;

            message = generator.value.message;

            if (shouldStopAddingMessages) {
                await messageHistoryGenerator.return();
                break;
            }
        }
        generator = await messageHistoryGenerator.next(true);
    }

    if (!message) {
        throw new Error(`No message found for character ${character.name}, yet time-forwards was requested.`);
    }

    const systemMessage = `You are an assistant and story analyst that helps determine how much time has passed in a story based on a single message from ${character.name}:\n\n"${message}"\n\nBased on the content, context, and any time-related references in the message, estimate how much time has passed within the boundaries of that message.`;
    const systemPrompt = engine.inferenceAdapter.buildSystemPromptForQuestioningAgent(systemMessage, [
        "You must respond in the format, 'Time Passed: X', where X is the amount of time that has passed (e.g., '8 seconds', '5 minutes', '2 hours', '3 days', '1 week').",
        "Be realistic about how long actions take.",
        "Vary your estimates naturally - do not default to 1 of any unit. Consider the actual duration implied by the actions described, don't be afraid to estimate or guess if it is unclear and give variety in your responses.",
        "If the message does not provide enough information to determine the time passed, give a rough estimate regardless.",
    ], null);
    const timePassedGenerator = engine.inferenceAdapter.runQuestioningCustomAgentOn(character, systemPrompt, null, [{ name: character.name, message: message }], "ALL", null);

    const timePassedResponse = await timePassedGenerator.next();
    if (timePassedResponse.done) {
        throw new Error("Failed to prime time-forwards agent.");
    }

    const nextQuestion = `According to the message provided from ${character.name}, how much time has passed?`;
    console.log("Asking question, " + nextQuestion);

    const answer = await timePassedGenerator.next({
        maxCharacters: 100,
        maxParagraphs: 1,
        nextQuestion: nextQuestion,
        stopAt: ["\n", "."],
        stopAfter: [],
        answerTrail: "Time Passed: ",
        grammar: `root ::= NUMBER " " UNIT ${engine.inferenceAdapter.getRequiredRootGrammarForQuestionGeneration()}\nNUMBER ::= ([1-9] | [1-9] [0-9] | [1-9] [0-9] [0-9])\nUNIT ::= ("seconds" | "second" | "minutes" | "minute" | "hours" | "hour" | "days" | "day" | "weeks" | "week" | "month" | "months" | "year" | "years")`,
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
        location.currentWeatherHasBeenOngoingFor.inDays += totalMilliseconds / (24 * 60 * 60 * 1000);
        location.currentWeatherHasBeenOngoingFor.inHours += totalMilliseconds / (60 * 60 * 1000);
        location.currentWeatherHasBeenOngoingFor.inMinutes += totalMilliseconds / (60 * 1000);
    }

    const storyMasterMessagesToAdd = [];

    // reroll world weather
    const characterState = engine.deObject.stateFor[character.name];
    const currentWeatherAtLocation = engine.deObject.world.locations[characterState.location].currentWeather;
    engine.rerollWorldWeather();
    const newWeatherAtLocation = engine.deObject.world.locations[characterState.location].currentWeather;
    if (currentWeatherAtLocation !== newWeatherAtLocation) {
        console.log(`Time-Forwards: Weather at ${characterState.location} changed from ${currentWeatherAtLocation} to ${newWeatherAtLocation} after time advanced.`);
        storyMasterMessagesToAdd.push(`The weather at ${characterState.location} has changed from ${currentWeatherAtLocation} to ${newWeatherAtLocation}.`);
    }
    // refresh character states, so that any effect of weather is updated
    engine.refreshCharacterStates();

    return storyMasterMessagesToAdd;
}