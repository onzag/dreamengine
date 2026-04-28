if (!window.API) {
    window.API = {
        mode: 'web',
        closeApp: () => {
            console.log('closeApp called - no-op in web version');
        },
        toggleFullScreen: () => {
            console.log('toggleFullScreen called - no-op in web version');
        },
        openDevTools: () => {
            console.log('openDevTools called - no-op in web version');
        },
        viewSource: async (fileUrl) => {
            // Web equivalent of the electron viewSource: fetch the file from
            // the same origin, syntax-highlight it client-side, and open the
            // result as a blob: URL in a new tab.
            if (typeof fileUrl !== 'string' || !fileUrl) {
                throw new Error('Invalid URL');
            }
            // Only allow URLs served by this same origin (the static mounts).
            let urlObj;
            try {
                urlObj = new URL(fileUrl, location.href);
            } catch {
                throw new Error('Invalid URL');
            }
            if (urlObj.origin !== location.origin) {
                throw new Error('URL not allowed');
            }

            const res = await fetch(urlObj.href, { credentials: 'same-origin' });
            if (!res.ok) {
                throw new Error(`viewSource fetch failed: ${res.status} ${res.statusText}`);
            }
            const source = await res.text();
            const fileName = decodeURIComponent(urlObj.pathname.split('/').pop() || 'source');

            const esc = (/** @type {string} */ s) => s
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            const highlightJS = (/** @type {string} */ code) => {
                const tokens = [];
                const re = /(\/\/.*$|\/\*[\s\S]*?\*\/)|(`(?:[^`\\]|\\[\s\S])*`)|('(?:[^'\\]|\\[\s\S])*'|"(?:[^"\\]|\\[\s\S])*")|(\/(?![*\/])(?:[^\[\/\\]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*)|(\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\b)|(\b(?:true|false|null|undefined|NaN|Infinity)\b)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b[a-zA-Z_$][\w$]*(?=\s*\())|([\n])/gm;
                let lastIndex = 0;
                let match;
                while ((match = re.exec(code)) !== null) {
                    if (match.index > lastIndex) {
                        tokens.push(esc(code.slice(lastIndex, match.index)));
                    }
                    const [, comment, template, str, regex, kw, cnst, num, fn, nl] = match;
                    if (nl) tokens.push(nl);
                    else if (comment) tokens.push(`<span class="cmt">${esc(comment)}</span>`);
                    else if (template) tokens.push(`<span class="tpl">${esc(template)}</span>`);
                    else if (str) tokens.push(`<span class="str">${esc(str)}</span>`);
                    else if (regex) tokens.push(`<span class="reg">${esc(regex)}</span>`);
                    else if (kw) tokens.push(`<span class="kw">${esc(kw)}</span>`);
                    else if (cnst) tokens.push(`<span class="cnst">${esc(cnst)}</span>`);
                    else if (num) tokens.push(`<span class="num">${esc(num)}</span>`);
                    else if (fn) tokens.push(`<span class="fn">${esc(fn)}</span>`);
                    lastIndex = re.lastIndex;
                }
                if (lastIndex < code.length) {
                    tokens.push(esc(code.slice(lastIndex)));
                }
                const highlighted = tokens.join('');
                const lines = highlighted.split('\n');
                return lines.map((line, i) => `<span class="ln">${i + 1}</span>${line}`).join('\n');
            };

            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(fileName)}</title>
<style>
body { margin:0; background:#1e1e1e; color:#d4d4d4; font-family:Consolas,'Courier New',monospace; font-size:14px; }
pre { margin:0; padding:16px; line-height:1.5; white-space:pre-wrap; word-wrap:break-word; tab-size:4; }
.ln { color:#858585; user-select:none; display:inline-block; min-width:3em; text-align:right; padding-right:1.5em; }
.kw { color:#569cd6; } .str { color:#ce9178; } .num { color:#b5cea8; }
.cmt { color:#6a9955; } .fn { color:#dcdcaa; } .reg { color:#d16969; }
.cnst { color:#4fc1ff; } .op { color:#d4d4d4; } .tpl { color:#ce9178; }
</style></head><body><pre>${highlightJS(source)}</pre></body></html>`;

            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);
            const win = window.open(blobUrl, '_blank', 'noopener,noreferrer');
            if (!win) {
                URL.revokeObjectURL(blobUrl);
                throw new Error('Popup blocked: please allow popups to view source');
            }
            // Revoke the blob URL after a short delay so the new tab has time
            // to load it.
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
        },
        detectEditors: () => {
            console.log('detectEditors called - no-op in web version');
            return Promise.resolve([]);
        },
        openInEditor: (filePath, editorCmd) => {
            console.log(`openInEditor called with ${filePath}, ${editorCmd} - no-op in web version`);
            return Promise.resolve();
        },

        onScriptsChanged: (callback) => {
            // Stream change notifications from the server via SSE; the browser's
            // EventSource auto-reconnects on disconnect.
            try {
                const es = new EventSource('/api/scripts/events', { withCredentials: true });
                es.addEventListener('scripts-changed', () => {
                    try { callback(); } catch (err) { console.error(err); }
                });
                es.onerror = (err) => {
                    console.warn('scripts-changed event stream error:', err);
                };
            } catch (err) {
                console.error('Failed to subscribe to scripts-changed events:', err);
            }
        },

        getDreamEnginePaths: () => {
            return Promise.resolve([
                location.protocol + '//' + location.host + "/.dreamengine",
                location.protocol + '//' + location.host + "/default-scripts"
            ]);
        },

        listScriptFiles: async () => {
            const res = await fetch('/api/scripts/list', { credentials: 'same-origin' });
            if (!res.ok) {
                throw new Error(`listScriptFiles failed: ${res.status} ${res.statusText}`);
            }
            return res.json();
        },
        newScriptFile: async (namespace, id, header) => {
            const res = await fetch('/api/scripts/new', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ namespace, id, header }),
            });
            if (!res.ok) {
                let detail = `${res.status} ${res.statusText}`;
                try { const d = await res.json(); if (d?.error) detail = d.error; } catch { /* */ }
                throw new Error(`newScriptFile("${namespace}/${id}") failed: ${detail}`);
            }
        },
        moveScriptFile: async (oldNamespace, oldId, newNamespace, newId) => {
            const res = await fetch('/api/scripts/move', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldNamespace, oldId, newNamespace, newId }),
            });
            if (!res.ok) {
                let detail = `${res.status} ${res.statusText}`;
                try { const d = await res.json(); if (d?.error) detail = d.error; } catch { /* */ }
                throw new Error(`moveScriptFile failed: ${detail}`);
            }
        },
        deleteScriptFile: async (namespace, id) => {
            const res = await fetch('/api/scripts/delete', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ namespace, id }),
            });
            if (!res.ok) {
                let detail = `${res.status} ${res.statusText}`;
                try { const d = await res.json(); if (d?.error) detail = d.error; } catch { /* */ }
                throw new Error(`deleteScriptFile("${namespace}/${id}") failed: ${detail}`);
            }
        },
        updateScriptFile: async (namespace, id, content) => {
            const res = await fetch('/api/scripts/update', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ namespace, id, content }),
            });
            if (!res.ok) {
                let detail = `${res.status} ${res.statusText}`;
                try { const d = await res.json(); if (d?.error) detail = d.error; } catch { /* */ }
                throw new Error(`updateScriptFile("${namespace}/${id}") failed: ${detail}`);
            }
        },

        getConfigValue: async (key) => {
            const res = await fetch(
                `/api/config/get?key=${encodeURIComponent(key)}`,
                { credentials: 'same-origin' },
            );
            if (!res.ok) {
                throw new Error(`getConfigValue("${key}") failed: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            return data.value;
        },
        setConfigValue: async (key, value) => {
            const res = await fetch('/api/config/set', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value }),
            });
            if (!res.ok) {
                throw new Error(`setConfigValue("${key}") failed: ${res.status} ${res.statusText}`);
            }
        },
        saveConfig: async () => {
            const res = await fetch('/api/config/save', {
                method: 'POST',
                credentials: 'same-origin',
            });
            if (!res.ok) {
                throw new Error(`saveConfig failed: ${res.status} ${res.statusText}`);
            }
        },

        uploadFileToDEPath: async (dePath, file) => {
            const arrayBuffer = await file.arrayBuffer();
            const res = await fetch(
                `/api/upload?path=${encodeURIComponent(dePath)}`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body: arrayBuffer,
                },
            );
            if (!res.ok) {
                let detail = `${res.status} ${res.statusText}`;
                try {
                    const data = await res.json();
                    if (data && data.error) detail = data.error;
                } catch { /* not json */ }
                throw new Error(`uploadFileToDEPath("${dePath}") failed: ${detail}`);
            }
            return true;
        },
    }
}