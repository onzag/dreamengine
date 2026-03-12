/**
 * Sanitizes an object in-place by removing prototypes so sandboxed code
 * cannot climb the prototype chain to reach the main realm's globals.
 * Skips objects that are already sanitized (prototype is null).
 * 
 * @param {*} obj 
 */
export function sanitizeDE(obj) {
    if (obj === null || typeof obj !== 'object') return;

    // Already sanitized — skip
    if (Object.getPrototypeOf(obj) === null) return;

    Object.setPrototypeOf(obj, null);

    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (typeof val === 'function') {
            Object.setPrototypeOf(val, null);
        } else if (typeof val === 'object' && val !== null) {
            sanitizeDE(val);
        }
    }
}