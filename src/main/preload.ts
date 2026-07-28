import { contextBridge, ipcRenderer } from 'electron';
import type { CabinetPreset, Project } from '../shared/types';

contextBridge.exposeInMainWorld('projectFiles', {
  open: (): Promise<{ filePath: string; project: Project } | null> => ipcRenderer.invoke('project:open'),
  save: (project: Project, currentPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('project:save', project, currentPath)
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
    ipcRenderer.invoke('image:save-png', bytes, defaultName)
});

contextBridge.exposeInMainWorld('exportFiles', {
  save: (bytes: Uint8Array, defaultName: string, extension: string): Promise<string | null> =>
    ipcRenderer.invoke('export:save', bytes, defaultName, extension),
  savePdf: (html: string, defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('export:pdf', html, defaultName)
});
