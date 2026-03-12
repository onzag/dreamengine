/**
 * @type {HTMLIFrameElement | null}
 */
let iframe = null;
/**
 * @type {Function | null}
 */
let IframeAsyncFunction = null;

function ensureIframe() {
    // @ts-ignore
    if (iframe && iframe.contentWindow) return;

    iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.sandbox = '';
    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow;

    // Strip dangerous APIs from the iframe's global
    // @ts-ignore
    delete iframeWindow.fetch;
    // @ts-ignore
    delete iframeWindow.XMLHttpRequest;
    // @ts-ignore
    delete iframeWindow.WebSocket;
    // @ts-ignore
    delete iframeWindow.EventSource;
    // @ts-ignore
    delete iframeWindow.Worker;
    // @ts-ignore
    delete iframeWindow.SharedWorker;
    // @ts-ignore
    delete iframeWindow.ServiceWorker;

    // Get AsyncFunction constructor from the iframe's realm
    // @ts-ignore
    IframeAsyncFunction = iframeWindow.eval('Object.getPrototypeOf(async function(){}).constructor');
}

/**
 * Creates an async function that runs inside an iframe sandbox.
 * Functions created this way retain the iframe's restricted scope even when called from the main context.
 * `fetch`, `XMLHttpRequest`, `WebSocket`, `Worker`, and other network/thread APIs are unavailable.
 * 
 * @param {string} args - Comma-separated list of argument names
 * @param {string} body - The function body source code
 * @param {string} [sourceURL] - Optional sourceURL for DevTools debugging
 * @returns {Function} An async function running in the iframe sandbox
 */
export function iframeSandbox(args, body, sourceURL) {
    ensureIframe();
    if (sourceURL) body += `\n//# sourceURL=${sourceURL}`;
    // @ts-ignore
    return new IframeAsyncFunction(args, body);
}
