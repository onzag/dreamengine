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

  saveFile(namespace: string, id: string, saveName: string, saveData: string, saveIndexData?: any): Promise<void>;
  deleteSaveFile(namespace: string, id: string, saveName: string): Promise<void>;

  listNarrators(language: string): Promise<Array<CharacterVoiceEntryWithLanguage>>;

  /**
   * Open or create a SQLite + sqlite-vec database at a path relative to
   * DREAMENGINE_HOME. The path **must** start with `"saves/"`.
   * If the same path is already open the existing connection UUID is returned.
   * @param dePath e.g. `"saves/mygame/world.db"`
   * @returns UUID that identifies this connection.
   */
  openDatabase(dePath: string): Promise<string>;

  /**
   * Close the database connection identified by `id`.
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
   * @param id UUID returned by {@link openDatabase}.
   * @param sql SQL statement to execute.
   * @param params Bound parameters. Pass `Uint8Array` for binary / vector data.
   */
  runQuery(
    id: string,
    sql: string,
    params?: Array<string | number | bigint | Uint8Array | null>,
  ): Promise<any[] | { changes: number; lastInsertRowid: number | bigint }>;

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
