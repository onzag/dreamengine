/** Tracks dialogs across shadow roots, including covered dialogs in a stack. */
/** @type {Set<HTMLElement>} */
const openDialogs = new Set();

export const DIALOG_OPENED_EVENT = 'app-dialog-opened';

/** @param {HTMLElement} dialog */
export function registerDialog(dialog) {
    if (openDialogs.has(dialog)) return;
    openDialogs.add(dialog);
    // Document listeners reach tooltips even when their hosts are in shadow roots.
    document.dispatchEvent(new Event(DIALOG_OPENED_EVENT));
}

/** @param {HTMLElement} dialog */
export function unregisterDialog(dialog) {
    openDialogs.delete(dialog);
}

export function hasOpenDialogs() {
    return openDialogs.size > 0;
}

/** @param {HTMLElement} dialog */
export function isTopDialog(dialog) {
    const dialogs = Array.from(openDialogs);
    return dialogs[dialogs.length - 1] === dialog;
}
