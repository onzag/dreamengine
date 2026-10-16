/**
 * @typedef {Object} SettingEntry
 * @property {string} label
 * @property {string} [placeholder]
 * @property {string} description
 * @property {"boolean" | "string" | "number"} type
 * @property {string|boolean|number} [default]
 * @property {number} [min] - For number type: minimum allowed value
 * @property {number} [max] - For number type: maximum allowed value
 * @property {boolean} [integer] - For number type: whether the value must be an integer
 */

/**
 * @typedef {() => Promise<Object<string, SettingEntry | null>> | Object<string, SettingEntry | null>} SettingsFunction
 */