import type { CabinetPreset, Project } from '@shared/types';
import type { Lang } from '@shared/lang';

/**
 * Платформенный слой: десктоп (Electron) или web-сборка для встраивания в CRM.
 *
 * В десктопе все файловые операции идут через preload-мост (window.*Files),
 * который выставляет Electron. В web-версии моста нет, поэтому здесь
 * устанавливается браузерная заглушка:
 *
 * - база кабинетов хранится в localStorage (проект — только в памяти);
 * - сохранение в файл, открытие проекта, импорт .srcx/RCFG и PDF недоступны,
 *   соответствующие кнопки в интерфейсе скрыты;
 * - PNG/CSV/XML-экспорт работает как обычное скачивание файла браузером.
 *
 * Стартовый каталог кабинетов web-версия пробует загрузить по относительному
 * пути `catalog/cabinet-presets.json` рядом с index.html (если он там лежит),
 * иначе библиотека просто пустая.
 */
export const WEB_PRESETS_KEY = 'dl-screen-master-cabinet-presets';
export const WEB_CATALOG_URL = 'catalog/cabinet-presets.json';

/** Снимок платформы делается до установки web-моста, иначе заглушка
 *  «притворяется» мостом и интерфейс решает, что он в Electron. */
const DESKTOP_AT_LOAD = typeof window !== 'undefined'
  && Boolean(window.projectFiles)
  && !(window as unknown as { __dlWebBridgeInstalled?: boolean }).__dlWebBridgeInstalled;

/** true, когда приложение запущено в Electron (preload-мост на месте). */
export function isDesktop(): boolean {
  return DESKTOP_AT_LOAD;
}

/** true для web-сборки (CRM-версия). */
export function isWeb(): boolean {
  return !isDesktop();
}

/** Разбирает базу кабинетов из localStorage; битые данные не ломают запуск. */
export function parseStoredPresets(raw: string | null): CabinetPreset[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CabinetPreset[]) : [];
  } catch {
    return [];
  }
}

/** Скачивание байтов браузером — замена нативному «Сохранить как…». */
function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/octet-stream'): string {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return fileName;
}

/** Диалог подтверждения с учётом языка интерфейса. */
function confirmDiscardChanges(lang: Lang): 'discard' | 'cancel' {
  const message = lang === 'en'
    ? 'Unsaved changes will be lost. Continue?'
    : 'Несохранённые изменения будут потеряны. Продолжить?';
  return window.confirm(message) ? 'discard' : 'cancel';
}

/**
 * Устанавливает браузерные реализации моста, если приложение открыто не в
 * Electron. Идемпотентно: в десктопе ничего не делает.
 */
export function installWebBridge(): void {
  if (isDesktop()) return;
  (window as unknown as { __dlWebBridgeInstalled?: boolean }).__dlWebBridgeInstalled = true;

  window.projectFiles = {
    // Файловых операций в web-версии нет — интерфейс их не показывает.
    open: async (): Promise<{ filePath: string; project: unknown } | null> => null,
    save: async (_project: Project): Promise<string | null> => null,
    confirmDiscard: async (lang: Lang) => confirmDiscardChanges(lang),
    confirmRecovery: async (lang: Lang) => (confirmDiscardChanges(lang) === 'discard' ? 'restore' : 'cancel')
  };

  window.projectRecovery = {
    load: async () => ({ status: 'none' as const }),
    save: async (): Promise<void> => undefined,
    clear: async (): Promise<void> => undefined
  };

  window.appLifecycle = {
    setDirty: (): void => undefined,
    onCloseSaveRequest: (): (() => void) => () => undefined,
    sendCloseSaveResult: (): void => undefined
  };

  window.presetFiles = {
    load: async (): Promise<CabinetPreset[]> => {
      try {
        return parseStoredPresets(window.localStorage.getItem(WEB_PRESETS_KEY));
      } catch {
        return [];
      }
    },
    save: async (presets: CabinetPreset[]): Promise<void> => {
      try {
        window.localStorage.setItem(WEB_PRESETS_KEY, JSON.stringify(presets));
      } catch {
        // Хранилище недоступно (приватный режим/запрет iframe) — работаем в памяти.
      }
    },
    catalog: async (): Promise<CabinetPreset[]> => {
      try {
        const response = await fetch(new URL(WEB_CATALOG_URL, document.baseURI).toString(), { cache: 'no-store' });
        if (!response.ok) return [];
        const parsed: unknown = await response.json();
        const presets = (parsed as { presets?: unknown } | null)?.presets;
        return Array.isArray(presets) ? (presets as CabinetPreset[]) : [];
      } catch {
        return [];
      }
    },
    // Импорт/экспорт JSON через файловые диалоги в web-версии не используется.
    import: async (): Promise<CabinetPreset[] | null> => null,
    importRcfg: async (): Promise<CabinetPreset | null> => null,
    export: async (): Promise<string | null> => null
  };

  window.imageFiles = {
    savePng: async (bytes: Uint8Array, defaultName: string): Promise<string | null> =>
      downloadBytes(bytes, defaultName, 'image/png'),
    saveMany: async (files: { name: string; bytes: Uint8Array }[]): Promise<string | null> => {
      for (const file of files) downloadBytes(file.bytes, file.name, 'image/png');
      return files[0]?.name ?? null;
    }
  };

  window.exportFiles = {
    save: async (bytes: Uint8Array, defaultName: string): Promise<string | null> =>
      downloadBytes(bytes, defaultName),
    savePdf: async (): Promise<string | null> => {
      throw new Error('PDF-отчёт доступен только в десктопной версии');
    }
  };
}
