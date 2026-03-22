/**
 * @returns {DETimeDurationDescription}
 * @param {number} ms 
 */
export function millisecondsToDuration(ms) {
    /**
     * @type {DETimeDurationDescription}
     */
    const value = {
        inDays: ms / (1000 * 60 * 60 * 24),
        inHours: ms / (1000 * 60 * 60),
        inMinutes: ms / (1000 * 60),
        inSeconds: ms / 1000,
    }
    return value;
}

/**
 * @returns {DETimeDescription}
 * @param {number} ms 
 */
export function millisecondsToTime(ms) {
    const dateObject = new Date(ms);
    /**
     * @type {DETimeDescription}
     */
    const defaultTimeDEFormat = {
        dayOfMonth: dateObject.getUTCDate(),
        monthOfYear: dateObject.getUTCMonth() + 1,
        year: dateObject.getUTCFullYear(),
        hourOfDay: dateObject.getUTCHours(),
        minuteOfHour: dateObject.getUTCMinutes(),
        time: dateObject.getTime(),
        dayOfWeek: dateObject.getUTCDay(),
    }

    return defaultTimeDEFormat;
}