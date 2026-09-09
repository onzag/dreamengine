/**
 * @typedef {Object} SettingEntry
 * @property {string} label
 * @property {string} [placeholder]
 * @property {string} description
 * @property {"boolean" | "string" | "select"} type
 * @property {string|boolean} [default]
 * @property {string[]} [options]
 */

/**
 * @typedef {() => Promise<Object<string, SettingEntry | null>> | Object<string, SettingEntry | null>} SettingsFunction
 */