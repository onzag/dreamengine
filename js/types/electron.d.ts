// Ambient typing for window.electronAPI used by preload.js
// This file lets VS Code/TypeScript language service provide IntelliSense
// for JavaScript files without converting the project to TypeScript.

declare interface ElectronAPI {
  toggleFullScreen(): void | Promise<void>;
  openDevTools(): void;
  closeApp(): void;

  loadValueFromUserData(key: string, cacheFile?: {fileType: string; fileName: string}): Promise<any>;
  setValueIntoUserData(key: string, cacheFile: {fileType: string; fileName: string} | null, value: any): Promise<void>;
  saveSettingsToDisk(): void;

  createEmptyCharacterFile(): Promise<{ group: string; characterFile: string }>; 
  createEmptyScriptFile(): Promise<{scriptFile: string}>;
  createEmptyWorldFile(): Promise<{worldFile: string}>;
  checkCharacterFileExists(characterFile: string): Promise<boolean>;
  updateCharacterFileFromCache(characterFile: string): Promise<any>;
  deleteCharacterFile(characterFile: string): Promise<boolean>;
  updateScriptFileFromCache(scriptFile: string): Promise<any>;
  deleteScriptFile(scriptFile: string): Promise<boolean>;
  updateWorldFileFromCache(worldFile: string): Promise<any>;
  deleteWorldFile(worldFile: string): Promise<boolean>;
  listScriptFiles(context: string): Promise<Array<{ file: string; name: string;}>>;
  listScriptContexts(): Promise<string[]>;
  listCharacterFiles(group: string): Promise<Array<{ file: string; name: string;}>>;
  listCharacterGroups(): Promise<string[]>;
  listWorldFiles(): Promise<string[]>;

  getDreamEnginePath(): Promise<string>;
  uploadFileToDEPath(dePath: string, file: File | Blob): Promise<boolean>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    DREAMENGINE_INFO_HOME?: string;
  }
}

export {};
