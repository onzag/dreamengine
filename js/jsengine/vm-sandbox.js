import vm from 'vm';

const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
});

/**
 * Creates an async function that runs inside a vm context.
 * Functions created this way retain the sandboxed scope even when called from the main context.
 * `import()`, `process`, `require`, and other Node.js globals are unavailable.
 * 
 * @param {string} args - Comma-separated list of argument names
 * @param {string} body - The function body source code
 * @param {string} [sourceURL] - Optional sourceURL for DevTools debugging
 * @returns {Function} An async function running in the vm sandbox
 */
export function vmSandbox(args, body, sourceURL) {
    const suffix = sourceURL ? `\n//# sourceURL=${sourceURL}` : '';
    const wrappedCode = `(async function(${args}) {\n${body}${suffix}\n})`;
    return vm.runInContext(wrappedCode, context);
}
