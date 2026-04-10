// Ambient typing for window.electronAPI used by preload.js
// This file lets VS Code/TypeScript language service provide IntelliSense
// for JavaScript files without converting the project to TypeScript.

import { EngineWorkerClient } from "../worker-sandbox/client";

declare interface DEAPI {
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
  onScriptsChanged(callback: () => void): void;
}

declare global {
  interface Window {
    API: DEAPI;
    DREAMENGINE_HOME: string;
    DREAMENGINE_DEFAULT_SCRIPTS_HOME: string;
    ENGINE_WORKER_CLIENT: EngineWorkerClient;
    JS_ENGINE_RECREATE: () => Promise<void>;
  }
}

export {};
