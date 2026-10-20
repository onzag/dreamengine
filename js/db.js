import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

/** @typedef {import("better-sqlite3").Database} BetterSqlite3Database */
/** @typedef {import("better-sqlite3").RunResult} RunResult */

/** @type {Map<string, BetterSqlite3Database>} */
const connections = new Map();

/** @type {Map<string, string>} Maps resolved absolute path → connection UUID */
const pathToId = new Map();

/**
 * Opens or creates a SQLite database at the given path and loads sqlite-vec.
 * If a connection to the same resolved path is already open its UUID is returned
 * instead of opening a second handle.
 * @param {string} dbPath - Absolute or relative path to the .db file.
 * @returns {{ id: string, db: BetterSqlite3Database }}
 */
export function openDatabase(dbPath) {
  const resolved = path.resolve(dbPath);
  const existing = pathToId.get(resolved);
  if (existing) {
    const db = connections.get(existing);
    if (db) return { id: existing, db };
    // stale entry (shouldn't happen, but clean up)
    pathToId.delete(resolved);
  }
  const id = randomUUID();
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  connections.set(id, db);
  pathToId.set(resolved, id);
  return { id, db };
}

/**
 * Closes the database connection identified by the given UUID.
 * @param {string} id - The UUID returned by openDatabase.
 */
export function closeDatabase(id) {
  const db = connections.get(id);
  if (db) {
    db.close();
    connections.delete(id);
    for (const [p, cid] of pathToId) {
      if (cid === id) { pathToId.delete(p); break; }
    }
  }
}

/**
 * Runs a SQL query on the database identified by the given UUID.
 *
 * - SELECT statements return an array of row objects.
 * - INSERT/UPDATE/DELETE return `{ changes, lastInsertRowid }`.
 *
 * @param {string} id - The UUID returned by openDatabase.
 * @param {string} sql - The SQL statement to execute.
 * @param {any[] | Record<string, any>} [params=[]] - Positional or named parameters.
 * @returns {any[] | RunResult}
 */
export function runQuery(id, sql, params = []) {
  const db = connections.get(id);
  if (!db) {
    throw new Error(`No database connection found for id "${id}".`);
  }
  const stmt = db.prepare(sql);
  if (stmt.reader) {
    return stmt.all(params);
  }
  return stmt.run(params);
}
