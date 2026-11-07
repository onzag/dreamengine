import { BaseDataManager } from "./base.js";

/** @type {Record<string, "text" | "boolean" | "json">} */
const conversationFields = {
    participants: "json",
    previousConversationIdsPerParticipant: "json",
    nextConversationIdsPerParticipant: "json",
    locations: "json",
    communicators: "json",
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
    content: "json",
    hiddenContent: "text",
    startTime: "json",
    duration: "json",
    endTime: "json",
    untimed: "boolean",
    isProcessingSideEffects: "boolean",
    canOnlyBeSeenByCharacter: "text",
    singleSummary: "text",
    summariesByCharacterId: "json",
    perspectiveMessageByCharacterId: "json",
    perspectiveByCharacterId: "json",
    emotion: "text",
    emotionalRange: "json",
    interactingCharacters: "json",
    metadata: "json",
    rumors: "json",
};

/** @param {string} name */
function normalizeSearchName(name) {
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

/** @param {DECharacterPerspective} perspective */
function perspectiveMembership(perspective) {
    /** @type {Map<string, {level: number, softLevel: number}>} */
    const items = new Map();
    /** @type {Map<string, {level: number, softLevel: number}>} */
    const openContainers = new Map();
    /** @type {Map<string, {level: number, softLevel: number}>} */
    const characters = new Map([[perspective.ownId, { level: 0, softLevel: 0 }]]);
    /**
     * @param {Map<string, {level: number, softLevel: number}>} entries
     * @param {string} id
     * @param {number} level
     * @param {number} [softLevel=level]
     */
    function remember(entries, id, level, softLevel = level) {
        if (!Number.isInteger(level) || level < 0 || level > 5) {
            throw new Error("Perspective memory level must be an integer from 0 to 5.");
        }
        if (!Number.isFinite(softLevel)) {
            throw new Error("Perspective memory softLevel must be a finite number.");
        }
        const existing = entries.get(id);
        if (!existing || level > existing.level || (level === existing.level && softLevel > existing.softLevel)) {
            entries.set(id, { level, softLevel });
        }
    }
    /** @param {DEItemInPerspective[]} entries */
    function visitItems(entries) {
        for (const item of entries) {
            for (const { id } of item.ids) {
                const level = item.memory?.level ?? 0;
                const softLevel = item.memory?.softLevel ?? level;
                remember(items, id, level, softLevel);
                if (item.containerProperties?.openable && item.state?.opened) remember(openContainers, id, level, softLevel);
            }
            for (const id of [...item.containingCharacters, ...item.ontopCharacters]) remember(characters, id, 0);
            visitItems(item.containing);
            visitItems(item.ontop);
        }
    }
    /** @param {DECharacterPerspectiveCharacter} character */
    function visitCharacter(character) {
        remember(characters, character.characterId, character.memory?.level ?? 0,
            character.memory?.softLevel ?? character.memory?.level ?? 0);
        for (const id of character.characterCarryingOtherCharactersIds) remember(characters, id, 0);
        visitItems(character.characterCarryingItems);
        visitItems(character.characterWearingItems);
    }
    visitCharacter(perspective.self);
    for (const slot of perspective.ownLocation.slots) {
        visitItems(slot.items);
        slot.characters.forEach(visitCharacter);
    }
    const groups = perspective.socialGroups;
    for (const character of [...groups.soloCharacters, ...groups.ownGroup, ...groups.otherGroups.flat()]) {
        visitCharacter(character);
    }
    return { items, openContainers, characters };
}

export class SQLiteBridge extends BaseDataManager {
    // Share one queue so conversation and perspective transactions cannot overlap.
    #operations = Promise.resolve();
    /** @type {Map<string, any>} */
    #readCache = new Map();
    // A single user-facing transaction may be active at a time. Setters require it;
    // getters see its uncommitted changes because every query uses the same connection.
    #transactionActive = false;

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
     * Cache up to 32 recent reads, including misses. Check inside the database queue
     * so reads cannot skip earlier writes. Never share cached objects with callers.
     * @template T
     * @param {any[]} key
     * @param {(id: string) => Promise<T>} operation
     * @param {boolean} [requireTransaction=false] Fail unless the engine's transaction is active.
     * @returns {Promise<T>}
     */
    withCachedRead(key, operation, requireTransaction = false) {
        return this.withDatabase(async (id) => {
            if (requireTransaction && !this.#transactionActive) {
                throw new Error("A transaction must be active before reading the database.");
            }
            const cacheKey = JSON.stringify([id, ...key]);
            if (this.#readCache.has(cacheKey)) {
                const value = this.#readCache.get(cacheKey);
                // Refresh insertion order to evict the least recently used entry.
                this.#readCache.delete(cacheKey);
                this.#readCache.set(cacheKey, value);
                return structuredClone(value);
            }
            const value = await operation(id);
            // Keep the query result private, including on the first read.
            const result = structuredClone(value);
            this.#readCache.set(cacheKey, value);
            if (this.#readCache.size > 32) {
                const oldest = this.#readCache.keys().next();
                if (!oldest.done) this.#readCache.delete(oldest.value);
            }
            return result;
        });
    }

    /**
     * A cached read that, for consistency with writes, requires the engine's single
     * transaction to be active even though it performs no modification. The requirement
     * is enforced inside the database queue, so reads always observe the in-progress
     * transaction and never the realtime database.
     * @template T
     * @param {any[]} key
     * @param {(id: string) => Promise<T>} operation
     * @returns {Promise<T>}
     */
    withTransactionalRead(key, operation) {
        return this.withCachedRead(key, operation, true);
    }

    /**
     * Invalidate even on failure, since a nontransactional write may have succeeded
     * before an error reached the client.
     * @template T
     * @param {(id: string) => Promise<T>} operation
     * @returns {Promise<T>}
     */
    withWrite(operation) {
        return this.withDatabase(async (id) => {
            try {
                return await operation(id);
            } finally {
                this.#readCache.clear();
            }
        });
    }

    /**
     * Run a modification inside the caller's open transaction, failing if none is active.
     * The change is not persisted until commitTransaction; rollbackTransaction discards it.
     * @template T
     * @param {(id: string) => Promise<T>} operation
     * @returns {Promise<T>}
     */
    withTransactionalWrite(operation) {
        return this.withDatabase(async (id) => {
            if (!this.#transactionActive) {
                throw new Error("A transaction must be active before modifying the database.");
            }
            try {
                return await operation(id);
            } finally {
                // Uncommitted reads may now be stale; drop them so later reads re-query.
                this.#readCache.clear();
            }
        });
    }

    /**
     * Begin the single user-facing transaction. Modifications are only allowed while it is open.
     * @returns {Promise<void>}
     */
    async newTransaction() {
        return this.withDatabase(async (id) => {
            if (this.#transactionActive) {
                throw new Error("A transaction is already active.");
            }
            await this.databaseController.runQuery(id, "BEGIN TRANSACTION");
            this.#transactionActive = true;
        });
    }

    /**
     * Commit the active transaction, persisting every modification made since it began.
     * @returns {Promise<void>}
     */
    async commitTransaction() {
        return this.withDatabase(async (id) => {
            if (!this.#transactionActive) {
                throw new Error("No transaction is active to commit.");
            }
            try {
                await this.databaseController.runQuery(id, "COMMIT");
            } finally {
                this.#transactionActive = false;
                this.#readCache.clear();
            }
        });
    }

    /**
     * Roll back the active transaction, discarding every modification made since it began.
     * @returns {Promise<void>}
     */
    async rollbackTransaction() {
        return this.withDatabase(async (id) => {
            if (!this.#transactionActive) {
                throw new Error("No transaction is active to roll back.");
            }
            try {
                await this.databaseController.runQuery(id, "ROLLBACK");
            } finally {
                this.#transactionActive = false;
                this.#readCache.clear();
            }
        });
    }

    /**
     * @returns {boolean}
     */
    hasActiveTransaction() {
        return this.#transactionActive;
    }

    async closeCurrentDatabase() {
        if (!this.currentDatabaseId) {
            this.#readCache.clear();
            this.#transactionActive = false;
            return;
        }
        return this.withWrite(async () => {
            // Closing abandons any open transaction; clear the flag for the next database.
            await super.closeCurrentDatabase();
            this.#transactionActive = false;
        });
    }

    /** Create every table and index before engine operations begin. */
    async newDatabase() {
        await super.newDatabase();
        this.#readCache.clear();
        try {
            await this.withInitializationTransaction(async (id) => {
                const statements = [
                    `CREATE TABLE IF NOT EXISTS engine_data (
                        key TEXT PRIMARY KEY NOT NULL,
                        value TEXT NOT NULL
                    )`,
                    `CREATE TABLE IF NOT EXISTS engine_conversations (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        ${columnDefinitions(conversationFields)}
                    )`,
                    `CREATE TABLE IF NOT EXISTS engine_conversation_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id INTEGER NOT NULL REFERENCES engine_conversations(id),
                        ${columnDefinitions(messageFields)}
                    )`,
                    `CREATE INDEX IF NOT EXISTS engine_messages_by_conversation
                        ON engine_conversation_messages (conversation_id, id)`,
                    `CREATE TABLE IF NOT EXISTS engine_conversation_participants (
                        conversation_id INTEGER NOT NULL REFERENCES engine_conversations(id),
                        participant_id TEXT NOT NULL,
                        locationId TEXT,
                        locationNameAtTheTime TEXT,
                        locationSlotId TEXT,
                        locationSlotNameAtTheTime TEXT,
                        search_location_name TEXT,
                        search_slot_name TEXT,
                        PRIMARY KEY (conversation_id, participant_id)
                    )`,
                    `CREATE INDEX IF NOT EXISTS engine_conversations_by_participant
                        ON engine_conversation_participants (participant_id, conversation_id)`,
                    `CREATE TABLE IF NOT EXISTS engine_perspectives (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        document TEXT NOT NULL CHECK (json_valid(document))
                    )`,
                ];
                for (const sql of statements) {
                    await this.databaseController.runQuery(id, sql);
                }
                await this.ensurePerspectiveSchema(id);
            });
        } catch (error) {
            await this.closeCurrentDatabase();
            throw error;
        }
    }

    /** @param {string} loadName */
    async loadDatabase(loadName) {
        await super.loadDatabase(loadName);
        this.#readCache.clear();
        try {
            await this.withInitializationTransaction(async (id) => {
                await this.databaseController.runQuery(id, `
                    CREATE TABLE IF NOT EXISTS engine_perspectives (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        document TEXT NOT NULL CHECK (json_valid(document))
                    )
                `);
                await this.ensurePerspectiveSchema(id);
                const additions = [
                    ["engine_conversations", "nextConversationIdsPerParticipant",
                        "TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(nextConversationIdsPerParticipant))"],
                    ["engine_conversation_messages", "isProcessingSideEffects",
                        "INTEGER NOT NULL DEFAULT 0 CHECK (isProcessingSideEffects IN (0, 1))"],
                    ["engine_conversation_messages", "summariesByCharacterId",
                        "TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(summariesByCharacterId))"],
                    ["engine_conversation_messages", "perspectiveMessageByCharacterId",
                        "TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(perspectiveMessageByCharacterId))"],
                    ["engine_conversation_messages", "perspectiveByCharacterId",
                        "TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(perspectiveByCharacterId))"],
                ];
                for (const [table, name, definition] of additions) {
                    const columns = await this.databaseController.runQuery(id, `PRAGMA table_info(${table})`);
                    if (!columns.some(column => column.name === name)) {
                        if (name === "isProcessingSideEffects" && columns.some(column => column.name === "streaming")) {
                            await this.databaseController.runQuery(id,
                                `ALTER TABLE ${table} RENAME COLUMN streaming TO isProcessingSideEffects`);
                            continue;
                        }
                        await this.databaseController.runQuery(id, `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
                        if (name === "nextConversationIdsPerParticipant") {
                            await this.databaseController.runQuery(id, `
                                UPDATE engine_conversations
                                SET nextConversationIdsPerParticipant = (
                                    SELECT json_group_object(value, NULL) FROM json_each(participants)
                                )
                            `);
                        }
                    }
                }
            });
        } catch (error) {
            await this.closeCurrentDatabase();
            throw error;
        }
    }

    /**
     * Self-contained BEGIN/COMMIT used only for schema setup during initialization,
     * before the engine opens its single runtime transaction. Not for runtime writes.
     * @template T
     * @param {(id: string) => Promise<T>} operation
     * @returns {Promise<T>}
     */
    withInitializationTransaction(operation) {
        return this.withWrite(async (id) => {
            await this.databaseController.runQuery(id, "BEGIN TRANSACTION");
            try {
                const result = await operation(id);
                await this.databaseController.runQuery(id, "COMMIT");
                return result;
            } catch (error) {
                await this.databaseController.runQuery(id, "ROLLBACK");
                throw error;
            }
        });
    }

    /**
     * Return location snapshots from any participant in this character's conversations.
     * Search names recorded at the time, including locations visited only by other participants.
     * @param {string} charId
     * @param {string} locationOrSlotName
     * @returns {Promise<DEConversationLocationMatch[]>}
     */
    async getPossibleLocationsCharKnowsAlikeTo(charId, locationOrSlotName) {
        const search = normalizeSearchName(locationOrSlotName);
        return this.withTransactionalRead(["knownLocations", charId, search], async (id) => {
            if (!search) return [];
            return this.databaseController.runQuery(id, `
                SELECT 'C' || place.conversation_id AS conversationId,
                    place.participant_id AS participantId,
                    place.locationId, place.locationNameAtTheTime,
                    place.locationSlotId, place.locationSlotNameAtTheTime
                FROM engine_conversation_participants AS known
                JOIN engine_conversation_participants AS place
                    ON place.conversation_id = known.conversation_id
                WHERE known.participant_id = ? AND place.locationId IS NOT NULL
                    AND (instr(place.search_location_name, ?) > 0
                        OR instr(place.search_slot_name, ?) > 0)
                ORDER BY place.conversation_id DESC, place.participant_id
            `, [charId, search, search]);
        });
    }

    /**
     * Refresh participant membership and searchable location snapshots inside the caller's transaction.
     * Locations keyed by characters outside the participant list are not evidence of an encounter.
     * @param {string} databaseId
     * @param {number} conversationId
     * @param {Pick<DEConversation, "participants" | "locations">} conversation
     * @returns {Promise<void>}
     */
    async indexConversationParticipants(databaseId, conversationId, conversation) {
        const entries = [...new Set(conversation.participants)].map(participantId => {
            const location = conversation.locations?.[participantId];
            return [
                participantId,
                location?.locationId ?? null,
                location?.locationNameAtTheTime ?? null,
                location?.locationSlotId ?? null,
                location?.locationSlotNameAtTheTime ?? null,
                location ? normalizeSearchName(location.locationNameAtTheTime) : null,
                location ? normalizeSearchName(location.locationSlotNameAtTheTime) : null,
            ];
        });
        await this.databaseController.runQuery(databaseId,
            "DELETE FROM engine_conversation_participants WHERE conversation_id = ?", [conversationId]);
        await this.databaseController.runQuery(databaseId, `
            INSERT INTO engine_conversation_participants (
                conversation_id, participant_id, locationId, locationNameAtTheTime,
                locationSlotId, locationSlotNameAtTheTime, search_location_name, search_slot_name
            )
            SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1]'),
                json_extract(value, '$[2]'), json_extract(value, '$[3]'),
                json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]')
            FROM json_each(?)
        `, [conversationId, JSON.stringify(entries)]);
    }

    /** @param {string} conversationId @returns {Promise<DEConversation | null>} */
    async getConversation(conversationId) {
        return this.withTransactionalRead(["conversation", conversationId], async (id) => {
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
        return this.withTransactionalRead(["message", messageId], async (id) => {
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
        return this.withTransactionalWrite(async (id) => {
            const rows = await this.databaseController.runQuery(id, `
                INSERT INTO engine_conversations (${Object.keys(conversationFields).join(", ")})
                VALUES (${values.map(() => "?").join(", ")}) RETURNING *
            `, values);
            await this.indexConversationParticipants(id, rows[0].id, readFields(conversationFields, rows[0]));
            const messages = [];
            for (const messageValues of initialMessages) {
                messages.push(await this.insertMessage(id, rows[0].id, messageValues));
            }
            return { ...readFields(conversationFields, rows[0], "C"), messages };
        });
    }

    /**
     * Append a message with a monotonically increasing ID, independent of timestamps.
     * New messages process side effects until explicitly completed by an update.
     * @param {string} conversationId
     * @param {Omit<DEConversationMessage, "id" | "isProcessingSideEffects">} message
     * @returns {Promise<DEConversationMessage | null>}
     */
    async newConversationMessage(conversationId, message) {
        const values = fieldValues(messageFields, { ...message, isProcessingSideEffects: true });
        return this.withTransactionalWrite(id =>
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
        return this.withTransactionalWrite(async (id) => {
            const query = values.length ? `
                UPDATE engine_conversations
                SET ${Object.keys(fields).map(name => `${name} = ?`).join(", ")}
                WHERE id = ? RETURNING *
            ` : "SELECT * FROM engine_conversations WHERE id = ?";
            const rows = await this.databaseController.runQuery(id, query,
                [...values, numericId(conversationId, "C")]);
            if (!rows.length) return null;
            if (Object.prototype.hasOwnProperty.call(fields, "participants") ||
                Object.prototype.hasOwnProperty.call(fields, "locations")) {
                await this.indexConversationParticipants(id, rows[0].id, readFields(conversationFields, rows[0]));
            }
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
     * Completed messages cannot be modified; return null if an update is refused.
     * @param {string} messageId
     * @param {Partial<Omit<DEConversationMessage, "id">>} message
     * @returns {Promise<DEConversationMessage | null>}
     */
    async updateConversationMessage(messageId, message) {
        const fields = Object.fromEntries(Object.entries(message)
            .filter(([name, value]) => Object.prototype.hasOwnProperty.call(messageFields, name) && value !== undefined)
            .map(([name]) => [name, messageFields[name]]));
        const values = fieldValues(fields, message);
        return this.withTransactionalWrite(async (id) => {
            const query = values.length ? `
                UPDATE engine_conversation_messages
                SET ${Object.keys(fields).map(name => `${name} = ?`).join(", ")}
                WHERE id = ? AND isProcessingSideEffects = 1 RETURNING *
            ` : "SELECT * FROM engine_conversation_messages WHERE id = ?";
            const rows = await this.databaseController.runQuery(id, query,
                [...values, numericId(messageId, "M")]);
            return rows.length ? readFields(messageFields, rows[0], "M") : null;
        });
    }

    /**
     * Add queryable snapshot fields and indexed membership tables to old and new databases.
     * The original wall-clock snapshot time is unknown for legacy rows and stays NULL.
     * @param {string} databaseId
     */
    async ensurePerspectiveSchema(databaseId) {
        const columns = await this.databaseController.runQuery(databaseId, "PRAGMA table_info(engine_perspectives)");
        let backfill = false;
        for (const [name, definition] of [
            ["ownId", "TEXT"],
            ["locationId", "TEXT"],
            ["locationSlotId", "TEXT"],
            ["snapshotTime", "INTEGER"],
            ["timeOfPerspective", "TEXT CHECK (timeOfPerspective IS NULL OR json_valid(timeOfPerspective))"],
            ["perspectiveTime", "REAL"],
        ]) {
            if (!columns.some(column => column.name === name)) {
                await this.databaseController.runQuery(databaseId,
                    `ALTER TABLE engine_perspectives ADD COLUMN ${name} ${definition}`);
                backfill = true;
            }
        }
        for (const column of ["ownId", "locationId", "locationSlotId", "snapshotTime", "perspectiveTime"]) {
            await this.databaseController.runQuery(databaseId,
                `CREATE INDEX IF NOT EXISTS engine_perspectives_by_${column} ON engine_perspectives (${column}, id)`);
        }
        await this.databaseController.runQuery(databaseId, `
            CREATE INDEX IF NOT EXISTS engine_perspectives_by_observer_time
            ON engine_perspectives (ownId, perspectiveTime DESC, id DESC)
        `);
        for (const [table, column] of [
            ["engine_perspective_items", "item_id"],
            ["engine_perspective_open_containers", "item_id"],
            ["engine_perspective_characters", "character_id"],
        ]) {
            await this.databaseController.runQuery(databaseId, `
                CREATE TABLE IF NOT EXISTS ${table} (
                    perspective_id INTEGER NOT NULL REFERENCES engine_perspectives(id) ON DELETE CASCADE,
                    ${column} TEXT NOT NULL,
                    memoryLevel INTEGER NOT NULL DEFAULT 0 CHECK (memoryLevel BETWEEN 0 AND 5),
                    memorySoftLevel REAL NOT NULL DEFAULT 0,
                    PRIMARY KEY (perspective_id, ${column})
                )
            `);
            const membershipColumns = await this.databaseController.runQuery(databaseId, `PRAGMA table_info(${table})`);
            if (!membershipColumns.some(column => column.name === "memoryLevel")) {
                await this.databaseController.runQuery(databaseId,
                    `ALTER TABLE ${table} ADD COLUMN memoryLevel INTEGER NOT NULL DEFAULT 0 CHECK (memoryLevel BETWEEN 0 AND 5)`);
                backfill = true;
            }
            if (!membershipColumns.some(column => column.name === "memorySoftLevel")) {
                await this.databaseController.runQuery(databaseId,
                    `ALTER TABLE ${table} ADD COLUMN memorySoftLevel REAL NOT NULL DEFAULT 0`);
                backfill = true;
            }
            await this.databaseController.runQuery(databaseId,
                `CREATE INDEX IF NOT EXISTS ${table}_lookup ON ${table} (${column}, perspective_id)`);
            await this.databaseController.runQuery(databaseId,
                `CREATE INDEX IF NOT EXISTS ${table}_memory_lookup ON ${table} (${column}, memoryLevel, perspective_id)`);
        }
        if (backfill) {
            const rows = await this.databaseController.runQuery(databaseId, "SELECT id, document FROM engine_perspectives");
            for (const row of rows) {
                const perspective = JSON.parse(row.document);
                await this.databaseController.runQuery(databaseId, `
                    UPDATE engine_perspectives SET ownId = ?, locationId = ?, locationSlotId = ?,
                        timeOfPerspective = ?, perspectiveTime = ? WHERE id = ?
                `, [perspective.ownId, perspective.ownLocationId, perspective.ownLocationSlotId,
                    JSON.stringify(perspective.timeOfPerspective), perspective.timeOfPerspective.time, row.id]);
                await this.indexPerspectiveMembership(databaseId, row.id, perspectiveMembership(perspective));
            }
        }
    }

    /**
     * @param {string} databaseId
     * @param {number} perspectiveId
     * @param {ReturnType<typeof perspectiveMembership>} membership
     */
    async indexPerspectiveMembership(databaseId, perspectiveId, membership) {
        for (const [table, column, entries] of [
            ["engine_perspective_items", "item_id", membership.items],
            ["engine_perspective_open_containers", "item_id", membership.openContainers],
            ["engine_perspective_characters", "character_id", membership.characters],
        ]) {
            await this.databaseController.runQuery(databaseId, `
                INSERT INTO ${table} (perspective_id, ${column}, memoryLevel, memorySoftLevel)
                SELECT ?, json_extract(value, '$[0]'), json_extract(value, '$[1].level'),
                    json_extract(value, '$[1].softLevel') FROM json_each(?)
                WHERE true
                ON CONFLICT (perspective_id, ${column}) DO UPDATE SET
                    memoryLevel = excluded.memoryLevel, memorySoftLevel = excluded.memorySoftLevel
            `, [perspectiveId, JSON.stringify([...entries])]);
        }
    }

    /**
     * Store a snapshot with queryable location, times, and deduplicated entity IDs.
     * snapshotTime is real-world Unix milliseconds at capture; perspectiveTime is story Unix milliseconds.
     * @param {DECharacterPerspective} perspective
     * @returns {Promise<string>}
     */
    async storePerspective(perspective) {
        const snapshotTime = Date.now();
        const document = JSON.stringify(perspective);
        const membership = perspectiveMembership(perspective);
        const values = [document, perspective.ownId, perspective.ownLocationId, perspective.ownLocationSlotId,
            snapshotTime, JSON.stringify(perspective.timeOfPerspective), perspective.timeOfPerspective.time];
        return this.withTransactionalWrite(async (id) => {
            const rows = await this.databaseController.runQuery(id, `
                INSERT INTO engine_perspectives
                    (document, ownId, locationId, locationSlotId, snapshotTime, timeOfPerspective, perspectiveTime)
                VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id
            `, values);
            await this.indexPerspectiveMembership(id, rows[0].id, membership);
            return "P" + rows[0].id;
        });
    }

    /**
     * Return the latest sighting still remembered at the supplied story time.
     * @param {string} charId
     * @param {string} otherCharId
     * @param {number} useMemoryFromTime Story Unix milliseconds, never wall-clock time.
     * @returns {Promise<DECharacterPerspective | null>}
     */
    async getLatestPerspectiveWithCharacter(charId, otherCharId, useMemoryFromTime) {
        return this.findLatestRememberedPerspective(charId, otherCharId, useMemoryFromTime, "character");
    }

    /**
     * @param {string} charId
     * @param {string} itemId
     * @param {number} useMemoryFromTime Story Unix milliseconds.
     * @param {boolean} [openContainerOnly=false] Match only sightings of this container while open.
     * @returns {Promise<DECharacterPerspective | null>}
     */
    async getLatestPerspectiveWithItem(charId, itemId, useMemoryFromTime, openContainerOnly = false) {
        return this.findLatestRememberedPerspective(charId, itemId, useMemoryFromTime,
            openContainerOnly ? "openContainer" : "item");
    }

    /**
     * Level 0: same instant; 1: five minutes; 2: one day; 3: seven days;
     * 4: thirty days; 5: permanent. Expiration boundaries are inclusive.
     * @param {string} charId
     * @param {string} entityId
     * @param {number} useMemoryFromTime
     * @param {"character" | "item" | "openContainer"} kind
     * @returns {Promise<DECharacterPerspective | null>}
     */
    async findLatestRememberedPerspective(charId, entityId, useMemoryFromTime, kind) {
        if (!Number.isFinite(useMemoryFromTime)) {
            throw new Error("useMemoryFromTime must be a finite story Unix timestamp in milliseconds.");
        }
        const [table, column] = {
            character: ["engine_perspective_characters", "character_id"],
            item: ["engine_perspective_items", "item_id"],
            openContainer: ["engine_perspective_open_containers", "item_id"],
        }[kind];
        return this.withTransactionalRead(["rememberedPerspective", charId, entityId, useMemoryFromTime, kind], async (id) => {
            const rows = await this.databaseController.runQuery(id, `
                SELECT perspective.document FROM engine_perspectives AS perspective
                JOIN ${table} AS seen ON seen.perspective_id = perspective.id
                WHERE perspective.ownId = ? AND seen.${column} = ?
                    AND perspective.perspectiveTime <= ?
                    AND (seen.memoryLevel = 5 OR ? - perspective.perspectiveTime <=
                        CASE seen.memoryLevel
                            WHEN 0 THEN 0
                            WHEN 1 THEN 300000
                            WHEN 2 THEN 86400000
                            WHEN 3 THEN 604800000
                            WHEN 4 THEN 2592000000
                        END)
                ORDER BY perspective.perspectiveTime DESC, perspective.id DESC LIMIT 1
            `, [charId, entityId, useMemoryFromTime, useMemoryFromTime]);
            return rows.length ? JSON.parse(rows[0].document) : null;
        });
    }

    /**
     * Return this observer's most recently stored snapshot, regardless of memory retention.
     * @param {string} charId
     * @returns {Promise<DECharacterPerspective | null>}
     */
    async getLastPerspectiveOfCharacter(charId) {
        return this.withTransactionalRead(["lastPerspective", charId], async (id) => {
            const rows = await this.databaseController.runQuery(id, `
                SELECT document FROM engine_perspectives
                WHERE ownId = ? ORDER BY id DESC LIMIT 1
            `, [charId]);
            return rows.length ? JSON.parse(rows[0].document) : null;
        });
    }

    /**
     * Retrieve a stored character perspective snapshot by its ID, deserialized from JSON.
     * @param {string} perspectiveId
     * @returns {Promise<DECharacterPerspective | null>}
     */
    async getPerspectiveById(perspectiveId) {
        return this.withTransactionalRead(["perspective", perspectiveId], async (id) => {
            const rows = await this.databaseController.runQuery(id,
                "SELECT document FROM engine_perspectives WHERE id = ?", [numericId(perspectiveId, "P")]);
            return rows.length ? JSON.parse(rows[0].document) : null;
        });
    }

    /**
     * @param {string} key
     * @param {any} value
     * @returns {Promise<void>}
     */
    async setJSONValue(key, value) {
        const json = JSON.stringify(value);
        await this.withWrite(id => this.databaseController.runQuery(id, `
            INSERT INTO engine_data (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [key, json]));
    }

    /**
     * @param {string} key
     * @returns {Promise<any>}
     */
    async getJSONValue(key) {
        return this.withCachedRead(["json", key], async (id) => {
            const rows = await this.databaseController.runQuery(id,
                "SELECT value FROM engine_data WHERE key = ?", [key]);
            return rows.length ? JSON.parse(rows[0].value) : null;
        });
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
