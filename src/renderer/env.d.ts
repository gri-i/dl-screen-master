import type { CabinetPreset, Project } from '@shared/types';
import type { Lang } from '@shared/lang';

declare global {
  interface Window {
    projectFiles: {
      open(): Promise<{ filePath: string; project: unknown } | null>;
      save(project: Project, currentPath?: string): Promise<string | null>;
      confirmDiscard(lang: Lang): Promise<'save' | 'discard' | 'cancel'>;
      confirmRecovery(lang: Lang): Promise<'restore' | 'ignore' | 'cancel'>;
    };
    projectRecovery: {
      load(): Promise<{
        status: 'none' | 'available' | 'corrupt' | 'error';
        project?: unknown;
        filePath?: string;
        savedAt?: string;
        message?: string;
      }>;
      save(project: Project, filePath?: string): Promise<void>;
      clear(): Promise<void>;
    };
    appLifecycle: {
      setDirty(dirty: boolean, lang: Lang): void;
      onCloseSaveRequest(handler: () => void): () => void;
      sendCloseSaveResult(saved: boolean): void;
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
      savePdf(html: string, defaultName: string, folderName: string, masks?: { name: string; bytes: Uint8Array }[]): Promise<string | null>;
    };
  }
}

export {};
