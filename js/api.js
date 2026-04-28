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
        viewSource: (fileUrl) => {
            console.log(`viewSource called with ${fileUrl} - no-op in web version`);
            return Promise.resolve();
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