import fs from 'fs';
import path from 'path';

/**
 * Describes a single script file change detected on disk.
 *
 * `options` carries the disposition of the file:
 *  - `{ deleted: true }`              — the file was removed from this path.
 *  - `{ moved: { newNamespace, newId } }` — the file was renamed/moved to a new
 *                                       namespace/id (best-effort, see below).
 *  - `undefined`                     — the file was created or its contents
 *                                       changed and it still exists at this path.
 *
 * @typedef {Object} ScriptChange
 * @property {string} namespace - Namespace of the affected script (old location for moves).
 * @property {string} id - Id of the affected script (old id for moves).
 * @property {{ deleted?: boolean, moved?: { newNamespace: string, newId: string } }} [options]
 */

/**
 * Watch a scripts folder organized as `<scriptFolder>/<namespace>/<id>.js` and
 * invoke `onChange` for each affected file, reporting whether it was deleted,
 * moved, or simply created/changed.
 *
 * Events are debounced so a burst of filesystem notifications for the same save
 * collapses into a single callback per file.
 *
 * Move detection is best-effort: on disk a move shows up as a deletion of the
 * old path plus a creation of the new path. When exactly one file disappears
 * and exactly one (rename-originated) file appears within the same debounce
 * window, it is reported as a move; otherwise the events are reported
 * individually (deleted vs. changed). Content modifications never participate in
 * move detection, which keeps an unrelated edit from being mistaken for a move.
 *
 * @param {string} scriptFolder - Absolute path to the scripts root directory.
 * @param {(change: ScriptChange) => void} onChange - Called once per affected file after debouncing.
 * @param {{ debounceMs?: number }} [opts]
 * @returns {fs.FSWatcher}
 */
export function watchScripts(scriptFolder, onChange, opts = {}) {
    const debounceMs = opts.debounceMs ?? 500;

    /**
     * Parse a watcher-relative filename (e.g. `myns/intro.js` or, on Windows,
     * `myns\intro.js`) into its namespace and id. Returns null for paths that
     * don't look like `<namespace>/<id>.js`.
     * @param {string} filename
     * @returns {{ namespace: string, id: string } | null}
     */
    const parse = (filename) => {
        const parts = String(filename).split(/[\\/]/).filter(Boolean);
        if (parts.length < 2) return null;
        const namespace = parts[0];
        const id = parts.slice(1).join('/').replace(/\.js$/, '');
        if (!namespace || !id) return null;
        return { namespace, id };
    };

    /**
     * Files touched during the current debounce window, keyed by `namespace/id`.
     * `renamed` records whether a `rename`-type event was seen, which is used to
     * tell a created/moved file apart from a plain content modification.
     * @type {Map<string, { namespace: string, id: string, renamed: boolean }>}
     */
    const touched = new Map();
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeout = null;

    const flush = () => {
        timeout = null;
        const entries = Array.from(touched.values());
        touched.clear();

        /** @type {Array<{ namespace: string, id: string }>} */
        const gone = [];
        /** @type {Array<{ namespace: string, id: string }>} */
        const appeared = [];
        /** @type {Array<{ namespace: string, id: string }>} */
        const modified = [];

        for (const { namespace, id, renamed } of entries) {
            const exists = fs.existsSync(path.join(scriptFolder, namespace, `${id}.js`));
            if (!exists) gone.push({ namespace, id });
            else if (renamed) appeared.push({ namespace, id });
            else modified.push({ namespace, id });
        }

        // Best-effort move detection: exactly one disappearance paired with
        // exactly one appearance within the window is treated as a move.
        if (gone.length === 1 && appeared.length === 1) {
            const from = gone.shift();
            const to = appeared.shift();
            if (from && to) {
                onChange({
                    namespace: from.namespace,
                    id: from.id,
                    options: { moved: { newNamespace: to.namespace, newId: to.id } },
                });
            }
        }

        for (const change of gone) {
            onChange({ namespace: change.namespace, id: change.id, options: { deleted: true } });
        }
        for (const change of appeared) {
            onChange({ namespace: change.namespace, id: change.id });
        }
        for (const change of modified) {
            onChange({ namespace: change.namespace, id: change.id });
        }
    };

    return fs.watch(scriptFolder, { recursive: true }, (eventType, filename) => {
        if (!filename || !String(filename).endsWith('.js')) return;
        const parsed = parse(filename);
        if (!parsed) return;

        const key = `${parsed.namespace}/${parsed.id}`;
        const prev = touched.get(key);
        touched.set(key, {
            namespace: parsed.namespace,
            id: parsed.id,
            renamed: (prev?.renamed ?? false) || eventType === 'rename',
        });

        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(flush, debounceMs);
    });
}
