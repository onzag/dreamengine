/**
 * @typedef {Object} SettingEntry
 * @property {string} label
 * @property {string} [placeholder]
 * @property {string} description
 * @property {"boolean" | "string"} type
 * @property {string|boolean} [default]
 */

/**
 * @typedef {() => Promise<Object<string, SettingEntry | null>> | Object<string, SettingEntry | null>} SettingsFunction
 */