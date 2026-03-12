const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

/**
 * Creates an async function with no sandboxing — runs in the current context.
 * Easy to debug since stack traces and breakpoints work normally.
 * 
 * @param {string} args - Comma-separated list of argument names
 * @param {string} body - The function body source code
 * @param {string} [sourceURL] - Optional sourceURL for DevTools debugging
 * @returns {Function} An async function
 */
export function insecureSandbox(args, body, sourceURL) {
    if (sourceURL) body += `\n//# sourceURL=${sourceURL}`;
    return new AsyncFunction(args, body);
}
