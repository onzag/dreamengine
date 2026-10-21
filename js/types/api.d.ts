// Ambient typing for window.electronAPI used by preload.js
// This file lets VS Code/TypeScript language service provide IntelliSense
// for JavaScript files without converting the project to TypeScript.

import { EngineWorkerClient } from "../worker-sandbox/client";

declare interface DEAPI {
  mode: 'electron' | 'web';
  toggleFullScreen(): void | Promise<void>;
  openDevTools(): void;
  viewSource(fileUrl: string): Promise<void>;
  detectEditors(): Promise<Array<{id: string, name: string, cmd: string}>>;
  openInEditor(filePath: string, editorCmd?: string): Promise<void>;
  closeApp(): void;

  listScriptFiles(): Promise<Array<{ id: string; namespace: string; }>>;
  newScriptFile(namespace: string, id: string, header?: string): Promise<void>;
  moveScriptFile(oldNamespace: string, oldId: string, newNamespace: string, newId: string): Promise<void>;
  deleteScriptFile(namespace: string, id: string): Promise<void>;
  updateScriptFile(namespace: string, id: string, content: string): Promise<void>;

  getConfigValue(key: string): Promise<any>;
  setConfigValue(key: string, value: any): Promise<void>;
  saveConfig(): Promise<void>;

  getDreamEnginePaths(): Promise<string[]>;
  uploadFileToDEPath(dePath: string, file: File | Blob): Promise<boolean>;
  deleteFileFromDEPath(dePath: string): Promise<boolean>;
  onScriptsChanged(callback: (
    namespace: string,
    id: string,
    options?: { deleted?: boolean; moved?: { newNamespace: string; newId: string } }
  ) => void): void;

  listNarrators(language: string): Promise<Array<CharacterVoiceEntryWithLanguage>>;

  /**
   * Create a brand new, empty SQLite + sqlite-vec database in the OS temporary
   * directory. Read/write it through {@link runQuery}, then persist it with
   * {@link saveDatabase}.
   * @returns UUID that identifies this connection.
   */
  newDatabase(): Promise<string>;

  /**
   * Close the database connection identified by `id` and delete its temporary
   * backing file.
   */
  closeDatabase(id: string): Promise<void>;

  /**
   * Execute a SQL statement on the database identified by `id`.
   *
   * - **SELECT** → resolves with an array of plain row objects. BLOB columns
   *   are delivered as `Uint8Array` (pass vector embeddings in the same way).
   * - **INSERT / UPDATE / DELETE** → resolves with
   *   `{ changes: number, lastInsertRowid: number | bigint }`.
   *
   * @param id UUID returned by {@link newDatabase} / {@link loadDatabaseFromStore}.
   * @param sql SQL statement to execute.
   * @param params Bound parameters. Pass `Uint8Array` for binary / vector data.
   */
  runQuery(
    id: string,
    sql: string,
    params?: Array<string | number | bigint | Uint8Array | null>,
  ): Promise<any[] | { changes: number; lastInsertRowid: number | bigint }>;

  /**
   * Persist a gzip-compressed, pristine copy of an open database into the saves
   * folder and record it in the saves index. Overwrites any existing save at
   * the same location. The file is stored under
   * `saves/<namespace>/<scriptId>/<fileName>.gz`.
   * @param id UUID of the open connection to snapshot.
   * @param namespace Script namespace (used as a subdirectory).
   * @param scriptId Script id (used as a subdirectory).
   * @param saveName Human-readable name of the save.
   * @param fileName Base file name supplied by the user (no extension).
   * @param metadata Arbitrary JSON metadata to store with the save.
   * @returns Stored path, relative to the saves folder.
   */
  saveDatabase(
    id: string,
    namespace: string,
    scriptId: string,
    saveName: string,
    fileName: string,
    metadata?: any,
  ): Promise<string>;

  /**
   * Decompress a stored save into the temporary directory and open it,
   * returning a connection UUID usable with {@link runQuery} / {@link saveDatabase}.
   * @param namespace Script namespace the save belongs to.
   * @param scriptId Script id the save belongs to.
   * @param fileName Base file name supplied when saving (no extension).
   * @returns UUID that identifies the opened connection.
   */
  loadDatabaseFromStore(namespace: string, scriptId: string, fileName: string): Promise<string>;

  /**
   * List the saves recorded for a given script namespace/id.
   */
  listSaveFiles(
    namespace: string,
    scriptId: string,
  ): Promise<Array<{
    namespace: string;
    scriptId: string;
    filePath: string;
    saveName: string;
    metadata: any;
  }>>;

  /**
   * Delete a stored save from disk and remove its entry from the saves index.
   * @param namespace Script namespace the save belongs to.
   * @param scriptId Script id the save belongs to.
   * @param fileName Base file name supplied when saving (no extension).
   */
  deleteDatabaseFromStore(namespace: string, scriptId: string, fileName: string): Promise<void>;

  startDiffusionProcess(): Promise<void>;
  stopDiffusionProcess(): Promise<void>;
  pauseVoice(): Promise<void>;
  resumeVoice(): Promise<void>;
  prepareFor(option: "diffusion" | "voice" | "inference"): Promise<void>;
}

declare global {
  interface Window {
    API: DEAPI;
    DREAM_AMBIENCE_CHOSEN: string;
    DREAM_AMBIENCE_CHOSEN_VOLUME: number;
    DREAMENGINE_LANGUAGE: string;
    DREAMENGINE_HOME: string;
    DREAMENGINE_DEFAULT_SCRIPTS_HOME: string;
    ENGINE_WORKER_CLIENT: EngineWorkerClient;
    GAME_VOICE: import("../app/components/game/voice-session.js").GameVoiceSession | null;
    JS_ENGINE_UPDATE: (
      namespace: string,
      id: string,
      options?: { deleted?: boolean; moved?: { newNamespace: string; newId: string } }
    ) => Promise<void>;
  }
}

export {};
