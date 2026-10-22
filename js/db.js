import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import zlib from "zlib";

/** @typedef {import("better-sqlite3").Database} BetterSqlite3Database */
/** @typedef {import("better-sqlite3").RunResult} RunResult */

/**
 * @typedef {Object} SaveEntry
 * @property {string} namespace - Script namespace the save belongs to.
 * @property {string} scriptId - Script id the save belongs to.
 * @property {string} filePath - Stored file path, relative to the saves root (POSIX separators).
 * @property {string} saveName - Human-readable name of the save.
 * @property {any} metadata - Arbitrary JSON metadata, or null.
 */

/** Extension appended to stored (gzip-compressed) database files. */
const ZIP_EXT = ".gz";

/** @type {Map<string, { db: BetterSqlite3Database, tempPath: string }>} */
const connections = new Map();

/** @type {Map<string, BetterSqlite3Database>} Maps a resolved saves root → its open index database. */
const indexDbs = new Map();

/**
 * Open (creating if needed) the `index.sqlite` tracking database at the root of
 * a saves folder. The handle is cached per resolved saves root.
 * @param {string} savesRoot - Absolute path to the saves folder.
 * @returns {BetterSqlite3Database}
 */
function getIndexDb(savesRoot) {
  const resolved = path.resolve(savesRoot);
  const cached = indexDbs.get(resolved);
  if (cached) return cached;

  fs.mkdirSync(resolved, { recursive: true });
  const db = new Database(path.join(resolved, "index.sqlite"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS saves (
      namespace TEXT NOT NULL,
      script_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      save_name TEXT NOT NULL,
      metadata  TEXT,
      PRIMARY KEY (namespace, script_id, file_path)
    );
  `);
  indexDbs.set(resolved, db);
  return db;
}

/**
 * Create and open a brand new, empty SQLite database (with sqlite-vec loaded)
 * inside the OS temporary directory. This is the working database the caller
 * reads and writes through {@link runQuery} before persisting it with
 * {@link saveDatabase}.
 * @returns {{ id: string, db: BetterSqlite3Database }}
 */
export function newDatabase() {
  const id = randomUUID();
  const tempPath = path.join(os.tmpdir(), `dreamengine-${id}.sqlite`);
  const db = new Database(tempPath);
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  connections.set(id, { db, tempPath });
  return { id, db };
}

/**
 * Close the connection identified by the given UUID and delete its backing
 * temporary database file (including WAL/SHM sidecars).
 * @param {string} id - The UUID returned by newDatabase/loadDatabaseFromStore.
 */
export function closeDatabase(id) {
  const entry = connections.get(id);
  if (!entry) return;
  entry.db.close();
  connections.delete(id);
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(entry.tempPath + suffix, { force: true });
  }
}

/**
 * Run a SQL query on the database identified by the given UUID.
 *
 * - SELECT statements return an array of row objects.
 * - INSERT/UPDATE/DELETE return `{ changes, lastInsertRowid }`.
 *
 * @param {string} id - The UUID returned by newDatabase/loadDatabaseFromStore.
 * @param {string} sql - The SQL statement to execute.
 * @param {any[] | Record<string, any>} [params=[]] - Positional or named parameters.
 * @returns {any[] | RunResult}
 */
export function runQuery(id, sql, params = []) {
  const entry = connections.get(id);
  if (!entry) {
    throw new Error(`No database connection found for id "${id}".`);
  }
  const stmt = entry.db.prepare(sql);
  if (stmt.reader) {
    return stmt.all(params);
  }
  return stmt.run(params);
}

/**
 * Persist a pristine, gzip-compressed copy of an open database into the saves
 * folder and record it in the `index.sqlite` tracking database.
 *
 * The file is written to `<savesRoot>/<namespace>/<scriptId>/<fileName>.gz` and
 * overwrites any existing file at that path.
 *
 * @param {string} id - UUID of the open connection to snapshot.
 * @param {string} savesRoot - Absolute path to the saves folder.
 * @param {string} namespace - Script namespace (used as a subdirectory).
 * @param {string} scriptId - Script id (used as a subdirectory).
 * @param {string} saveName - Human-readable name of the save.
 * @param {string} fileName - Base file name supplied by the user (no extension).
 * @param {any} [metadata] - Arbitrary JSON metadata to store alongside the save.
 * @returns {Promise<{ filePath: string }>} The stored path, relative to savesRoot.
 */
export async function saveDatabase(id, savesRoot, namespace, scriptId, saveName, fileName, metadata) {
  const entry = connections.get(id);
  if (!entry) {
    throw new Error(`No database connection found for id "${id}".`);
  }

  const relPath = path.join(namespace, scriptId, fileName + ZIP_EXT);
  const absPath = path.join(savesRoot, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  // Take a consistent, pristine copy via SQLite's online backup API, then
  // gzip it into place. The backup correctly accounts for WAL state.
  const backupPath = path.join(os.tmpdir(), `dreamengine-backup-${randomUUID()}.sqlite`);
  await entry.db.backup(backupPath);
  try {
    const compressed = zlib.gzipSync(fs.readFileSync(backupPath));
    fs.writeFileSync(absPath, compressed); // overwrite by default
  } finally {
    fs.rmSync(backupPath, { force: true });
  }

  const relPosix = relPath.split(path.sep).join("/");
  getIndexDb(savesRoot)
    .prepare(`
      INSERT INTO saves (namespace, script_id, file_path, save_name, metadata)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(namespace, script_id, file_path) DO UPDATE SET
        save_name = excluded.save_name,
        metadata  = excluded.metadata;
    `)
    .run(namespace, scriptId, relPosix, saveName, metadata == null ? null : JSON.stringify(metadata));

  return { filePath: relPosix };
}

/**
 * Load a previously saved database from the store: decompress it, write the
 * copy to the OS temporary directory and open it (with sqlite-vec loaded). The
 * returned id can be used with {@link runQuery} and passed back to
 * {@link saveDatabase} to overwrite the stored copy.
 *
 * @param {string} savesRoot - Absolute path to the saves folder.
 * @param {string} namespace - Script namespace the save belongs to.
 * @param {string} scriptId - Script id the save belongs to.
 * @param {string} fileName - Base file name supplied when saving (no extension).
 * @returns {Promise<{ id: string, db: BetterSqlite3Database }>}
 */
export async function loadDatabaseFromStore(savesRoot, namespace, scriptId, fileName) {
  const relPath = path.join(namespace, scriptId, fileName + ZIP_EXT);
  const resolvedRoot = path.resolve(savesRoot);
  const absPath = path.resolve(resolvedRoot, relPath);
  /** @param {string} root @param {string} target */
  const assertInsideRoot = (root, target) => {
    const relative = path.relative(root, target);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("Save file must be inside savesRoot.");
    }
  };
  assertInsideRoot(resolvedRoot, absPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Save file does not exist: ${relPath.split(path.sep).join("/")}`);
  }

  // Resolve symlinks and junctions as well, so an in-root link cannot escape.
  const realRoot = fs.realpathSync(resolvedRoot);
  const realPath = fs.realpathSync(absPath);
  assertInsideRoot(realRoot, realPath);

  const raw = zlib.gunzipSync(fs.readFileSync(realPath));
  const id = randomUUID();
  const tempPath = path.join(os.tmpdir(), `dreamengine-${id}.sqlite`);
  fs.writeFileSync(tempPath, raw);

  const db = new Database(tempPath);
  sqliteVec.load(db);
  db.pragma("journal_mode = WAL");
  connections.set(id, { db, tempPath });
  return { id, db };
}

/**
 * List the saves recorded in `index.sqlite` for a given script namespace/id.
 * @param {string} savesRoot - Absolute path to the saves folder.
 * @param {string} namespace - Script namespace to filter by.
 * @param {string} scriptId - Script id to filter by.
 * @returns {SaveEntry[]}
 */
export function listSaveFiles(savesRoot, namespace, scriptId) {
  const rows = /** @type {any[]} */ (
    getIndexDb(savesRoot)
      .prepare(`
        SELECT namespace, script_id, file_path, save_name, metadata
        FROM saves
        WHERE namespace = ? AND script_id = ?
        ORDER BY save_name;
      `)
      .all(namespace, scriptId)
  );
  return rows.map((r) => ({
    namespace: r.namespace,
    scriptId: r.script_id,
    filePath: r.file_path,
    saveName: r.save_name,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
  }));
}

/**
 * Delete a stored save from disk and remove its entry from the `index.sqlite`
 * tracking database.
 * @param {string} savesRoot - Absolute path to the saves folder.
 * @param {string} namespace - Script namespace the save belongs to.
 * @param {string} scriptId - Script id the save belongs to.
 * @param {string} fileName - Base file name supplied when saving (no extension).
 * @returns {void}
 */
export function deleteDatabaseFromStore(savesRoot, namespace, scriptId, fileName) {
  const relPath = path.join(namespace, scriptId, fileName + ZIP_EXT);
  const absPath = path.join(savesRoot, relPath);
  const relPosix = relPath.split(path.sep).join("/");

  fs.rmSync(absPath, { force: true });

  getIndexDb(savesRoot)
    .prepare(`
      DELETE FROM saves
      WHERE namespace = ? AND script_id = ? AND file_path = ?;
    `)
    .run(namespace, scriptId, relPosix);
}

