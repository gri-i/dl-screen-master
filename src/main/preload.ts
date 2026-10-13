import { contextBridge, ipcRenderer } from 'electron';
import type { CabinetPreset, Project } from '../shared/types';
import type { Lang } from '../shared/lang';

contextBridge.exposeInMainWorld('projectFiles', {
  open: (): Promise<{ filePath: string; project: unknown } | null> => ipcRenderer.invoke('project:open'),
  save: (project: Project, currentPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('project:save', project, currentPath),
  confirmDiscard: (lang: Lang): Promise<'save' | 'discard' | 'cancel'> => ipcRenderer.invoke('app:confirm-discard', lang),
  confirmRecovery: (lang: Lang): Promise<'restore' | 'ignore' | 'cancel'> => ipcRenderer.invoke('app:confirm-recovery', lang)
});

contextBridge.exposeInMainWorld('projectRecovery', {
  load: (): Promise<{
    status: 'none' | 'available' | 'corrupt' | 'error';
    project?: unknown;
    filePath?: string;
    savedAt?: string;
    message?: string;
  }> => ipcRenderer.invoke('app:recovery-load'),
  save: (project: Project, filePath?: string): Promise<void> => ipcRenderer.invoke('app:recovery-save', project, filePath),
  clear: (): Promise<void> => ipcRenderer.invoke('app:recovery-clear')
});

contextBridge.exposeInMainWorld('appLifecycle', {
  setDirty: (dirty: boolean, lang: Lang): void => { ipcRenderer.send('app:set-dirty', dirty, lang); },
  onCloseSaveRequest: (handler: () => void): (() => void) => {
    const listener = (): void => handler();
    ipcRenderer.on('app:request-close-save', listener);
    return () => ipcRenderer.removeListener('app:request-close-save', listener);
  },
  sendCloseSaveResult: (saved: boolean): void => { ipcRenderer.send('app:close-save-result', saved); }
});

contextBridge.exposeInMainWorld('presetFiles', {
  load: (): Promise<CabinetPreset[]> => ipcRenderer.invoke('presets:load'),
  save: (presets: CabinetPreset[]): Promise<void> => ipcRenderer.invoke('presets:save', presets),
  import: (): Promise<CabinetPreset[] | null> => ipcRenderer.invoke('presets:import'),
  importRcfg: (): Promise<CabinetPreset | null> => ipcRenderer.invoke('presets:import-rcfg'),
  export: (presets: CabinetPreset[]): Promise<string | null> => ipcRenderer.invoke('presets:export', presets)
});

contextBridge.exposeInMainWorld('imageFiles', {
  savePng: (bytes: Uint8Array, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('image:save-png', bytes, defaultName),
  saveMany: (files: { name: string; bytes: Uint8Array }[]): Promise<string | null> =>
    ipcRenderer.invoke('image:save-many', files)
});

contextBridge.exposeInMainWorld('exportFiles', {
  save: (bytes: Uint8Array, defaultName: string, extension: string): Promise<string | null> =>
    ipcRenderer.invoke('export:save', bytes, defaultName, extension),
  savePdf: (html: string, defaultName: string, folderName: string, masks?: { name: string; bytes: Uint8Array }[]): Promise<string | null> =>
    ipcRenderer.invoke('export:pdf', html, defaultName, folderName, masks)
});
