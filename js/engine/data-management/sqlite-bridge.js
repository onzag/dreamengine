import { BaseDataManager } from "./base.js";

/** @type {Record<string, "text" | "boolean" | "json">} */
const conversationFields = {
    participants: "json",
    remoteParticipants: "json",
    previousConversationIdsPerParticipant: "json",
    location: "text",
    startTime: "json",
    endTime: "json",
    pseudoConversation: "boolean",
    bondsAtStart: "json",
    bondsAtEnd: "json",
    pseudoConversationSummary: "text",
    metadata: "json",
};

/** @type {Record<string, "text" | "boolean" | "json">} */
const messageFields = {
    characterId: "text",
    isCharacter: "boolean",
    isRejectedMessage: "boolean",
    isStoryMasterMessage: "boolean",
    isDebugMessage: "boolean",
    isHiddenMessage: "boolean",
    content: "json",
    hiddenContent: "text",
    startTime: "json",
    duration: "json",
    endTime: "json",
    untimed: "boolean",
    canOnlyBeSeenByCharacter: "text",
    singleSummary: "text",
    perspectiveSummaryIds: "json",
    emotion: "text",
    emotionalRange: "json",
    interactingCharacters: "json",
    metadata: "json",
    rumors: "json",
};

/** @type {typeof messageFields} */
const historicStateFields = {
    location: "text",
    locationSlot: "text",
    states: "json",
    time: "json",
    conversationId: "text",
    posture: "text",
    carrying: "json",
    carryingCharactersDirectly: "json",
    wearing: "json",
    dead: "boolean",
    deadEnded: "boolean",
    deadEndReason: "text",
    seenItems: "json",
    seenCharacters: "json",
};

/** @param {string} name */
function normalizeHistoricName(name) {
    return name.normalize("NFKD").toLowerCase().replace(/[\p{M}]/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
}

/** @param {typeof messageFields} fields */
function columnDefinitions(fields) {
    return Object.entries(fields).map(([name, type]) => {
        if (type === "boolean") return `${name} INTEGER CHECK (${name} IN (0, 1))`;
        if (type === "json") return `${name} TEXT CHECK (${name} IS NULL OR json_valid(${name}))`;
        return `${name} TEXT`;
    }).join(",\n");
}

/** @param {typeof messageFields} fields @param {Record<string, any>} value */
function fieldValues(fields, value) {
    return Object.entries(fields).map(([name, type]) => {
        const item = value[name];
        if (item == null) return null;
        if (type === "json") return JSON.stringify(item);
        if (type === "boolean") return item ? 1 : 0;
        return item;
    });
}

/**
 * @param {typeof messageFields} fields
 * @param {Record<string, any>} row
 * @param {string} [prefix]
 * @returns {any}
 */
function readFields(fields, row, prefix) {
    /** @type {Record<string, any>} */
    const value = prefix ? { id: prefix + row.id } : {};
    for (const [name, type] of Object.entries(fields)) {
        const item = row[name];
        if (name === "hiddenContent" && item === null) continue;
        value[name] = item === null ? null : (
            type === "json" ? JSON.parse(item) : type === "boolean" ? Boolean(item) : item
        );
    }
    return value;
}

/** @param {string} value @param {string} prefix @returns {number | null} */
function numericId(value, prefix) {
    if (typeof value !== "string" || !value.startsWith(prefix)) return null;
    const digits = value.slice(prefix.length);
    if (!/^[1-9][0-9]*$/.test(digits)) return null;
    const id = Number(digits);
    return Number.isSafeInteger(id) ? id : null;
}

export class SQLiteBridge extends BaseDataManager {
    // Share one queue so conversation and history transactions cannot overlap.
    #operations = Promise.resolve();
    /** @type {string | null} */
    #conversationDatabaseId = null;
    /** @type {string | null} */
    #historicDatabaseId = null;

    /**
     * @template T
     * @param {(id: string) => Promise<T>} operation
     * @returns {Promise<T>}
     */
    withDatabase(operation) {
        const id = this.currentDatabaseId;
        if (!id) {
            return Promise.reject(new Error("No database is currently loaded."));
        }
        const result = this.#operations.then(() => operation(id));
        // A failed operation must not prevent later operations from running.
        this.#operations = result.then(() => {}, () => {});
        return result;
    }

    /**
     * @template T
     * @param {(id: string) => Promise<T>} operation
     * @returns {Promise<T>}
     */
    withConversationTables(operation) {
        return this.withDatabase(async (id) => {
            if (this.#conversationDatabaseId !== id) {
                await this.databaseController.runQuery(id, `
                    CREATE TABLE IF NOT EXISTS engine_conversations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ${columnDefinitions(conversationFields)}
                    )
                `);
                await this.databaseController.runQuery(id, `
                    CREATE TABLE IF NOT EXISTS engine_conversation_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id INTEGER NOT NULL REFERENCES engine_conversations(id),
                        ${columnDefinitions(messageFields)}
                    )
                `);
                await this.databaseController.runQuery(id, `
                    CREATE INDEX IF NOT EXISTS engine_messages_by_conversation
                    ON engine_conversation_messages (conversation_id, id)
                `);
                this.#conversationDatabaseId = id;
            }
            return operation(id);
        });
    }

    /**
     * @template T
     * @param {(id: string) => Promise<T>} operation
     * @returns {Promise<T>}
     */
    withHistoricTables(operation) {
        return this.withDatabase(async (id) => {
            if (this.#historicDatabaseId !== id) {
                await this.databaseController.runQuery(id, `
                    CREATE TABLE IF NOT EXISTS engine_historic_states (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        charId TEXT NOT NULL,
                        ${columnDefinitions(historicStateFields)}
                    )
                `);
                await this.databaseController.runQuery(id, `
                    CREATE INDEX IF NOT EXISTS engine_history_by_character
                    ON engine_historic_states (charId, id)
                `);
                for (const [table, column] of [
                    ["engine_historic_seen_characters", "character_id"],
                    ["engine_historic_seen_items", "item_id"],
                    ["engine_historic_applied_states", "state"],
                ]) {
                    await this.databaseController.runQuery(id, `
                        CREATE TABLE IF NOT EXISTS ${table} (
                            historic_state_id INTEGER NOT NULL REFERENCES engine_historic_states(id),
                            ${column} TEXT NOT NULL,
                            name TEXT,
                            search_name TEXT
                        )
                    `);
                    await this.databaseController.runQuery(id, `
                        CREATE INDEX IF NOT EXISTS ${table}_lookup
                        ON ${table} (historic_state_id, ${column})
                    `);
                }
                this.#historicDatabaseId = id;
            }
            return operation(id);
        });
    }

    /** @param {string} charId @param {DEStateForCharacter} state @returns {Promise<void>} */
    async storeHistoricState(charId, state) {
        // Capture both the snapshot and its lookup values before any asynchronous work.
        const values = fieldValues(historicStateFields, state);
        const characters = state.seenCharacters.map(character =>
            [character.id, character.name, normalizeHistoricName(character.name)]);
        const items = state.seenItems.map(item => [item.id, item.name, normalizeHistoricName(item.name)]);
        const states = state.states.map(applied => [applied.state, null, null]);
        return this.withHistoricTables(async (id) => {
            await this.databaseController.runQuery(id, "BEGIN TRANSACTION");
            try {
                const rows = await this.databaseController.runQuery(id, `
                    INSERT INTO engine_historic_states (charId, ${Object.keys(historicStateFields).join(", ")})
                    VALUES (?, ${values.map(() => "?").join(", ")}) RETURNING id
                `, [charId, ...values]);
                for (const [table, column, entries] of [
                    ["engine_historic_seen_characters", "character_id", characters],
                    ["engine_historic_seen_items", "item_id", items],
                    ["engine_historic_applied_states", "state", states],
                ]) {
                    await this.databaseController.runQuery(id, `
                        INSERT INTO ${table} (historic_state_id, ${column}, name, search_name)
                        SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]')
                        FROM json_each(?)
                    `, [rows[0].id, JSON.stringify(entries)]);
                }
                await this.databaseController.runQuery(id, "COMMIT");
            } catch (error) {
                await this.databaseController.runQuery(id, "ROLLBACK");
                throw error;
            }
        });
    }

    /**
     * Search indexed snapshot contents, never the current character/item names.
     * @param {string} charId
     * @param {number} matches
     * @param {"character" | "item" | "state"} kind
     * @param {string} value
     * @param {boolean} [byName=false]
     * @returns {Promise<DEStateForCharacter[]>}
     */
    async findHistoricStates(charId, matches, kind, value, byName = false) {
        if (!Number.isSafeInteger(matches) || matches < 0) {
            throw new Error("Historic state match count must be a non-negative safe integer.");
        }
        const [table, column] = {
            character: ["engine_historic_seen_characters", "character_id"],
            item: ["engine_historic_seen_items", "item_id"],
            state: ["engine_historic_applied_states", "state"],
        }[kind];
        const search = byName ? normalizeHistoricName(value) : value;
        return this.withHistoricTables(async (id) => {
            if (matches === 0 || (byName && !search)) return [];
            const rows = await this.databaseController.runQuery(id, `
                SELECT history.* FROM engine_historic_states AS history
                WHERE history.charId = ? AND EXISTS (
                    SELECT 1 FROM ${table} AS seen WHERE seen.historic_state_id = history.id
                    AND ${byName ? "instr(seen.search_name, ?) > 0" : `seen.${column} = ?`}
                )
                ORDER BY history.id DESC LIMIT ?
            `, [charId, search, matches]);
            return rows.map(row => readFields(historicStateFields, row));
        });
    }

    /** @param {string} charId @param {string} state @returns {Promise<number>} */
    async getHistoricStateActivationCyclesAgo(charId, state) {
        return this.withHistoricTables(async (id) => {
            const rows = await this.databaseController.runQuery(id, `
                WITH latest AS (
                    SELECT history.id, history.states FROM engine_historic_states AS history
                    WHERE history.charId = ? AND EXISTS (
                        SELECT 1 FROM engine_historic_applied_states AS applied
                        WHERE applied.historic_state_id = history.id AND applied.state = ?
                    )
                    ORDER BY history.id DESC LIMIT 1
                )
                SELECT COALESCE(json_extract(applied.value, '$.contiguousStartActivationCyclesAgo'), 0)
                    + (SELECT COUNT(*) FROM engine_historic_states AS newer
                       WHERE newer.charId = ? AND newer.id >= latest.id) AS cycles
                FROM latest, json_each(latest.states) AS applied
                WHERE json_extract(applied.value, '$.state') = ? LIMIT 1
            `, [charId, state, charId, state]);
            return rows.length ? rows[0].cycles : -1;
        });
    }

    /** @param {string} charId @param {string} otherCharId @returns {Promise<DEStateForCharacter | null>} */
    async getFirstHistoricStateWithCharacter(charId, otherCharId) {
        return (await this.findHistoricStates(charId, 1, "character", otherCharId))[0] ?? null;
    }

    /** @param {string} charId @param {number} matches @param {string} name @returns {Promise<DEStateForCharacter[]>} */
    async getFirstNHistoricStatesWithCharacterName(charId, matches, name) {
        return this.findHistoricStates(charId, matches, "character", name, true);
    }

    /** @param {string} charId @param {string} state @returns {Promise<DEStateForCharacter | null>} */
    async getFirstHistoricStateWithState(charId, state) {
        return (await this.findHistoricStates(charId, 1, "state", state))[0] ?? null;
    }

    /** @param {string} charId @param {string} itemId @returns {Promise<DEStateForCharacter | null>} */
    async getFirstHistoricStateWithItem(charId, itemId) {
        return (await this.findHistoricStates(charId, 1, "item", itemId))[0] ?? null;
    }

    /** @param {string} charId @param {number} matches @param {string} name @returns {Promise<DEStateForCharacter[]>} */
    async getFirstNHistoricStatesWithItemName(charId, matches, name) {
        return this.findHistoricStates(charId, matches, "item", name, true);
    }

    /** @param {string} conversationId @returns {Promise<DEConversation | null>} */
    async getConversation(conversationId) {
        return this.withConversationTables(async (id) => {
            const rows = await this.databaseController.runQuery(id,
                "SELECT * FROM engine_conversations WHERE id = ?", [numericId(conversationId, "C")]);
            if (!rows.length) return null;
            const messages = await this.databaseController.runQuery(id, `
                SELECT * FROM engine_conversation_messages
                WHERE conversation_id = ? ORDER BY id
            `, [rows[0].id]);
            return {
                ...readFields(conversationFields, rows[0], "C"),
                messages: messages.map(row => readFields(messageFields, row, "M")),
            };
        });
    }

    /** @param {string} messageId @returns {Promise<DEConversationMessage | null>} */
    async getConversationMessage(messageId) {
        return this.withConversationTables(async (id) => {
            const rows = await this.databaseController.runQuery(id,
                "SELECT * FROM engine_conversation_messages WHERE id = ?", [numericId(messageId, "M")]);
            return rows.length ? readFields(messageFields, rows[0], "M") : null;
        });
    }

    /**
     * Generate new IDs for the conversation and any initial messages, in array order.
     * @param {Omit<DEConversation, "id">} conversation
     * @returns {Promise<DEConversation>}
     */
    async newConversation(conversation) {
        const values = fieldValues(conversationFields, conversation);
        const initialMessages = conversation.messages.map(message => fieldValues(messageFields, message));
        return this.withConversationTables(async (id) => {
            await this.databaseController.runQuery(id, "BEGIN TRANSACTION");
            try {
                const rows = await this.databaseController.runQuery(id, `
                    INSERT INTO engine_conversations (${Object.keys(conversationFields).join(", ")})
                    VALUES (${values.map(() => "?").join(", ")}) RETURNING *
                `, values);
                const messages = [];
                for (const messageValues of initialMessages) {
                    messages.push(await this.insertMessage(id, rows[0].id, messageValues));
                }
                await this.databaseController.runQuery(id, "COMMIT");
                return { ...readFields(conversationFields, rows[0], "C"), messages };
            } catch (error) {
                await this.databaseController.runQuery(id, "ROLLBACK");
                throw error;
            }
        });
    }

    /**
     * Append a message with a monotonically increasing ID, independent of timestamps.
     * @param {string} conversationId
     * @param {Omit<DEConversationMessage, "id">} message
     * @returns {Promise<DEConversationMessage | null>}
     */
    async newConversationMessage(conversationId, message) {
        const values = fieldValues(messageFields, message);
        return this.withConversationTables(id =>
            this.insertMessage(id, numericId(conversationId, "C"), values));
    }

    /**
     * @param {string} databaseId
     * @param {number | null} conversationId
     * @param {any[]} values
     * @returns {Promise<DEConversationMessage | null>}
     */
    async insertMessage(databaseId, conversationId, values) {
        const rows = await this.databaseController.runQuery(databaseId, `
            INSERT INTO engine_conversation_messages (conversation_id, ${Object.keys(messageFields).join(", ")})
            SELECT id, ${values.map(() => "?").join(", ")}
            FROM engine_conversations WHERE id = ? RETURNING *
        `, [...values, conversationId]);
        return rows.length ? readFields(messageFields, rows[0], "M") : null;
    }

    /**
     * Update supplied fields without changing the conversation's ID or messages.
     * @param {string} conversationId
     * @param {Partial<Omit<DEConversation, "id" | "messages">>} conversation
     * @returns {Promise<DEConversation | null>}
     */
    async updateConversation(conversationId, conversation) {
        const fields = Object.fromEntries(Object.entries(conversation)
            .filter(([name, value]) => Object.prototype.hasOwnProperty.call(conversationFields, name) && value !== undefined)
            .map(([name]) => [name, conversationFields[name]]));
        const values = fieldValues(fields, conversation);
        return this.withConversationTables(async (id) => {
            const query = values.length ? `
                UPDATE engine_conversations
                SET ${Object.keys(fields).map(name => `${name} = ?`).join(", ")}
                WHERE id = ? RETURNING *
            ` : "SELECT * FROM engine_conversations WHERE id = ?";
            const rows = await this.databaseController.runQuery(id, query,
                [...values, numericId(conversationId, "C")]);
            if (!rows.length) return null;
            const messages = await this.databaseController.runQuery(id, `
                SELECT * FROM engine_conversation_messages
                WHERE conversation_id = ? ORDER BY id
            `, [rows[0].id]);
            return {
                ...readFields(conversationFields, rows[0], "C"),
                messages: messages.map(row => readFields(messageFields, row, "M")),
            };
        });
    }

    /**
     * Update supplied fields without changing the message's ID or insertion order.
     * @param {string} messageId
     * @param {Partial<Omit<DEConversationMessage, "id">>} message
     * @returns {Promise<DEConversationMessage | null>}
     */
    async updateConversationMessage(messageId, message) {
        const fields = Object.fromEntries(Object.entries(message)
            .filter(([name, value]) => Object.prototype.hasOwnProperty.call(messageFields, name) && value !== undefined)
            .map(([name]) => [name, messageFields[name]]));
        const values = fieldValues(fields, message);
        return this.withConversationTables(async (id) => {
            const query = values.length ? `
                UPDATE engine_conversation_messages
                SET ${Object.keys(fields).map(name => `${name} = ?`).join(", ")}
                WHERE id = ? RETURNING *
            ` : "SELECT * FROM engine_conversation_messages WHERE id = ?";
            const rows = await this.databaseController.runQuery(id, query,
                [...values, numericId(messageId, "M")]);
            return rows.length ? readFields(messageFields, rows[0], "M") : null;
        });
    }

    /**
     * Create the JSON store on demand for both new and previously saved databases.
     * @returns {Promise<string>}
     */
    async ensureDataTable() {
        const id = this.currentDatabaseId;
        if (!id) {
            throw new Error("No database is currently loaded.");
        }
        await this.databaseController.runQuery(id, `
            CREATE TABLE IF NOT EXISTS engine_data (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            )
        `);
        return id;
    }

    /**
     * @param {string} key
     * @param {any} value
     * @returns {Promise<void>}
     */
    async setJSONValue(key, value) {
        const json = JSON.stringify(value);
        const id = await this.ensureDataTable();
        await this.databaseController.runQuery(id, `
            INSERT INTO engine_data (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [key, json]);
    }

    /**
     * @param {string} key
     * @returns {Promise<any>}
     */
    async getJSONValue(key) {
        const id = await this.ensureDataTable();
        const rows = await this.databaseController.runQuery(id,
            "SELECT value FROM engine_data WHERE key = ?", [key]);
        return rows.length ? JSON.parse(rows[0].value) : null;
    }

    /** @param {DEObject} deObject @returns {Promise<void>} */
    async setDEObject(deObject) {
        await this.setJSONValue("deObject", deObject);
    }

    /** @param {string[]} scriptOrder @returns {Promise<void>} */
    async setScriptOrder(scriptOrder) {
        await this.setJSONValue("scriptOrder", scriptOrder);
    }

    /** @returns {Promise<DEObject | null>} */
    async getDEObject() {
        return this.getJSONValue("deObject");
    }

    /** @returns {Promise<string[] | null>} */
    async getScriptOrder() {
        return this.getJSONValue("scriptOrder");
    }
}
