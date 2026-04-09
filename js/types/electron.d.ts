// Ambient typing for window.electronAPI used by preload.js
// This file lets VS Code/TypeScript language service provide IntelliSense
// for JavaScript files without converting the project to TypeScript.

import { EngineWorkerClient } from "../worker-sandbox/client";

declare interface ElectronAPI {
  toggleFullScreen(): void | Promise<void>;
  openDevTools(): void;
  closeApp(): void;

  listScriptFiles(): Promise<Array<{ id: string; namespace: string; }>>;

  getConfigValue(key: string): Promise<any>;
  setConfigValue(key: string, value: any): Promise<void>;
  saveConfig(): Promise<void>;

  getDreamEnginePaths(): Promise<string[]>;
  uploadFileToDEPath(dePath: string, file: File | Blob): Promise<boolean>;
}

declare global {
  interface Window {
    API: ElectronAPI;
    DREAMENGINE_HOME: string;
    DREAMENGINE_DEFAULT_SCRIPTS_HOME: string;
    ENGINE_WORKER_CLIENT: EngineWorkerClient;
  }
}

export {};
