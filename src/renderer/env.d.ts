import type { CabinetPreset, Project } from '@shared/types';

declare global {
  interface Window {
    projectFiles: {
      open(): Promise<{ filePath: string; project: Project } | null>;
      save(project: Project, currentPath?: string): Promise<string | null>;
    };
    presetFiles: {
      load(): Promise<CabinetPreset[]>;
      save(presets: CabinetPreset[]): Promise<void>;
      import(): Promise<CabinetPreset[] | null>;
      importRcfg(): Promise<CabinetPreset | null>;
      export(presets: CabinetPreset[]): Promise<string | null>;
    };
    imageFiles: {
      savePng(bytes: Uint8Array, defaultName: string): Promise<string | null>;
      saveMany(files: { name: string; bytes: Uint8Array }[]): Promise<string | null>;
    };
    exportFiles: {
      save(bytes: Uint8Array, defaultName: string, extension: string): Promise<string | null>;
      savePdf(html: string, defaultName: string, masks?: { name: string; bytes: Uint8Array }[]): Promise<string | null>;
    };
  }
}

export {};
