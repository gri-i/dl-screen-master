import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { CabinetPreset, Project } from '../shared/types';
import type { Lang } from '../shared/lang';
import { unzipSync } from 'fflate';
import { readJson, writeJsonAtomically } from './persistence';

app.setName('DL_SCREEN MASTER');

type CloseChoice = 'save' | 'discard' | 'cancel';
type RecoveryLoadResult =
  | { status: 'none' }
  | { status: 'available'; filePath?: string; project: unknown; savedAt: string }
  | { status: 'corrupt' }
  | { status: 'error'; message: string };

let mainWindow: BrowserWindow | null = null;
let windowDirty = false;
let windowLang: Lang = 'ru';
let closeFlowInProgress = false;
let closeSaveWaiter: ((saved: boolean) => void) | null = null;
let recoveryOperation = Promise.resolve();

function recoveryPath(): string {
  return path.join(app.getPath('userData'), 'recovery', 'current.dlscreen-recovery.json');
}

function queueRecoveryOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = recoveryOperation.then(operation, operation);
  recoveryOperation = next.then(() => undefined, () => undefined);
  return next;
}

function localizedCloseDialog(lang: Lang): { message: string; detail: string; buttons: [string, string, string] } {
  return lang === 'en'
    ? { message: 'Save changes to the current project?', detail: 'Unsaved changes will be lost if you do not save them.', buttons: ['Save', 'Don’t save', 'Cancel'] }
    : { message: 'Сохранить изменения в текущем проекте?', detail: 'Несохранённые изменения будут потеряны, если их не сохранить.', buttons: ['Сохранить', 'Не сохранять', 'Отмена'] };
}

async function confirmClose(): Promise<void> {
  const win = mainWindow;
  if (!win || closeFlowInProgress) return;
  closeFlowInProgress = true;
  const copy = localizedCloseDialog(windowLang);
  try {
    const result = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: copy.buttons,
      defaultId: 0,
      cancelId: 2,
      message: copy.message,
      detail: copy.detail,
      noLink: true
    });
    const choice: CloseChoice = result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel';
    if (choice === 'save') {
      const saved = await new Promise<boolean>((resolve) => {
        closeSaveWaiter = resolve;
        win.webContents.send('app:request-close-save');
        setTimeout(() => {
          if (closeSaveWaiter) {
            closeSaveWaiter = null;
            resolve(false);
          }
        }, 30_000);
      });
      if (!saved) return;
    } else if (choice === 'cancel') {
      return;
    } else {
      await queueRecoveryOperation(() => rm(recoveryPath(), { force: true }));
    }
    windowDirty = false;
    win.destroy();
  } finally {
    closeFlowInProgress = false;
  }
}

ipcMain.on('app:close-save-result', (event, saved: unknown) => {
  if (event.sender !== mainWindow?.webContents || !closeSaveWaiter) return;
  const resolve = closeSaveWaiter;
  closeSaveWaiter = null;
  resolve(saved === true);
});

ipcMain.handle('app:confirm-discard', async (_event, lang: Lang = 'ru'): Promise<CloseChoice> => {
  const copy = localizedCloseDialog(lang === 'en' ? 'en' : 'ru');
  const options = {
    type: 'question', buttons: copy.buttons, defaultId: 0, cancelId: 2,
    message: copy.message, detail: copy.detail, noLink: true
  } as const;
  const result = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  return result.response === 0 ? 'save' : result.response === 1 ? 'discard' : 'cancel';
});

ipcMain.handle('app:confirm-recovery', async (_event, lang: Lang = 'ru'): Promise<'restore' | 'ignore' | 'cancel'> => {
  const english = lang === 'en';
  const options = {
    type: 'question',
    buttons: english ? ['Restore', 'Ignore', 'Cancel'] : ['Восстановить', 'Игнорировать', 'Отмена'],
    defaultId: 0,
    cancelId: 2,
    message: english ? 'Recover unsaved project changes?' : 'Восстановить несохранённые изменения проекта?',
    detail: english ? 'A recovery copy was found after the previous session.' : 'После предыдущего запуска найдена recovery-копия проекта.',
    noLink: true
  } as const;
  const result = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  return result.response === 0 ? 'restore' : result.response === 1 ? 'ignore' : 'cancel';
});

ipcMain.on('app:set-dirty', (_event, dirty: unknown, lang: Lang = 'ru') => {
  windowDirty = dirty === true;
  windowLang = lang === 'en' ? 'en' : 'ru';
});

ipcMain.handle('app:recovery-load', async (): Promise<RecoveryLoadResult> => {
  return queueRecoveryOperation(async () => {
    try {
      const value = await readJson(recoveryPath());
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'corrupt' };
      const record = value as { project?: unknown; filePath?: unknown; savedAt?: unknown };
      if (!record.project || typeof record.savedAt !== 'string') return { status: 'corrupt' };
      return {
        status: 'available' as const,
        project: record.project,
        filePath: typeof record.filePath === 'string' ? record.filePath : undefined,
        savedAt: record.savedAt
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'none' as const };
      if (error instanceof SyntaxError) return { status: 'corrupt' as const };
      return { status: 'error' as const, message: error instanceof Error ? error.message : String(error) };
    }
  });
});

ipcMain.handle('app:recovery-save', async (_event, project: Project, filePath?: string): Promise<void> => {
  await queueRecoveryOperation(() => writeJsonAtomically(recoveryPath(), { version: 1, savedAt: new Date().toISOString(), filePath, project }));
});

ipcMain.handle('app:recovery-clear', async (): Promise<void> => {
  await queueRecoveryOperation(() => rm(recoveryPath(), { force: true }));
});

ipcMain.handle('project:open', async (): Promise<{ filePath: string; project: unknown } | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Открыть проект DL_SCREEN MASTER',
    properties: ['openFile'],
    filters: [{ name: 'DL_SCREEN MASTER', extensions: ['dlscreen', 'json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return { filePath, project: JSON.parse(await readFile(filePath, 'utf8')) as unknown };
});

ipcMain.handle('project:save', async (_event, project: Project, currentPath?: string): Promise<string | null> => {
  let filePath = currentPath;
  if (!filePath) {
    const result = await dialog.showSaveDialog({
      title: 'Сохранить проект DL_SCREEN MASTER',
      defaultPath: `${project.name || 'project'}.dlscreen`,
      filters: [{ name: 'DL_SCREEN MASTER', extensions: ['dlscreen'] }]
    });
    if (result.canceled || !result.filePath) return null;
    filePath = result.filePath;
  }
  await writeJsonAtomically(filePath, project);
  await queueRecoveryOperation(() => rm(recoveryPath(), { force: true }));
  return filePath;
});

function presetProfilePath(): string {
  return path.join(app.getPath('userData'), 'cabinet-presets.json');
}

ipcMain.handle('presets:load', async (): Promise<CabinetPreset[]> => {
  try {
    return JSON.parse(await readFile(presetProfilePath(), 'utf8')) as CabinetPreset[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
});

ipcMain.handle('presets:save', async (_event, presets: CabinetPreset[]): Promise<void> => {
  await writeJsonAtomically(presetProfilePath(), presets);
});

ipcMain.handle('presets:import', async (): Promise<CabinetPreset[] | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Импорт пресетов кабинетов', properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const parsed: unknown = JSON.parse(await readFile(result.filePaths[0], 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Файл пресетов должен содержать JSON-массив');
  return parsed as CabinetPreset[];
});

function xmlNumber(xml: string, tag: string): number | undefined {
  const match = xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i'));
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

function pixelPitchFromFileName(fileName: string): number {
  const normalized = fileName.replace(',', '.');
  const labelled = normalized.match(/(?:^|[^a-z0-9])(?:p|pitch|pixel[-_\s]*pitch)[-_\s]*(\d+(?:\.\d+)?)/i);
  if (labelled) return Number(labelled[1]);

  // An unlabelled decimal is common in cabinet model names. Integers are not
  // accepted here because dates and model numbers must not become pixel pitch.
  const decimal = normalized.match(/(?:^|[^0-9])(\d{1,2}\.\d+)(?:[^0-9]|$)/);
  return decimal ? Number(decimal[1]) : 1;
}

ipcMain.handle('presets:import-rcfg', async (): Promise<CabinetPreset | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Импорт кабинета NovaStar',
    properties: ['openFile'],
    filters: [{ name: 'NovaStar Cabinet Configuration', extensions: ['rcfg', 'rcfgx'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const bytes = new Uint8Array(await readFile(filePath));
  let xml = '';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const archive = unzipSync(bytes);
    const xmlEntry = Object.entries(archive).find(([name]) => name.toLowerCase().endsWith('.xml'));
    if (!xmlEntry) throw new Error('В RCFGX не найден XML с конфигурацией кабинета');
    xml = new TextDecoder('utf-8').decode(xmlEntry[1]);
  } else {
    xml = new TextDecoder('utf-8').decode(bytes);
  }

  const resolutionX = xmlNumber(xml, 'Width');
  const resolutionY = xmlNumber(xml, 'Height');
  if (!resolutionX || !resolutionY) throw new Error('Не удалось определить разрешение кабинета из RCFG');

  const sourceName = path.basename(filePath, path.extname(filePath));
  const pixelPitchMm = pixelPitchFromFileName(sourceName);
  const scanBoard = xml.match(/<ScanBoardName>([^<]+)<\/ScanBoardName>/i)?.[1]?.trim();
  const safeName = sourceName.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '');

  return {
    id: `rcfg-${safeName || Date.now()}`,
    brand: 'NovaStar',
    model: sourceName,
    widthMm: Number((resolutionX * pixelPitchMm).toFixed(2)),
    heightMm: Number((resolutionY * pixelPitchMm).toFixed(2)),
    pixelPitchMm,
    resolutionX,
    resolutionY,
    weightKg: 1,
    maxPowerW: 200,
    avgPowerW: 80,
    receiverCardName: scanBoard
  };
});

ipcMain.handle('presets:export', async (_event, presets: CabinetPreset[]): Promise<string | null> => {
  const result = await dialog.showSaveDialog({
    title: 'Экспорт пресетов кабинетов', defaultPath: 'cabinet-presets.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, `${JSON.stringify(presets, null, 2)}\n`, 'utf8');
  return result.filePath;
});

ipcMain.handle('image:save-png', async (_event, bytes: Uint8Array, defaultName: string): Promise<string | null> => {
  const result = await dialog.showSaveDialog({
    title: 'Экспорт изображения',
    defaultPath: defaultName,
    filters: [{ name: 'PNG', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, Buffer.from(bytes));
  return result.filePath;
});

ipcMain.handle('image:save-many', async (_event, files: { name: string; bytes: Uint8Array }[]): Promise<string | null> => {
  if (files.length === 0) return null;
  const result = await dialog.showOpenDialog({
    title: 'Папка для экспорта масок PNG',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const dir = result.filePaths[0];
  await Promise.all(files.map((file) => writeFile(path.join(dir, file.name), Buffer.from(file.bytes))));
  return dir;
});

ipcMain.handle('export:save', async (_event, bytes: Uint8Array, defaultName: string, extension: string): Promise<string | null> => {
  const result = await dialog.showSaveDialog({
    title: 'Экспорт проекта',
    defaultPath: defaultName,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, Buffer.from(bytes));
  return result.filePath;
});

function safeFolderName(name: string): string {
  const cleaned = name.trim().replace(/[<>:"/\\|?* -]+/g, '-').replace(/\s+/g, ' ').slice(0, 80);
  return cleaned.replace(/[.\s]+$/, '') || 'export';
}

ipcMain.handle('export:pdf', async (
  event,
  html: string,
  defaultName: string,
  folderName: string,
  masks?: { name: string; bytes: Uint8Array }[]
): Promise<string | null> => {
  const result = await dialog.showSaveDialog({
    title: 'Экспорт PDF-отчёта',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return null;
  // Все файлы отчёта (PDF + маски PNG) складываем в одну подпапку с именем
  // проекта рядом с выбранным путём — чтобы не разлетались по корню диска.
  const projectDir = path.join(path.dirname(result.filePath), safeFolderName(folderName));
  await mkdir(projectDir, { recursive: true });
  const pdfPath = path.join(projectDir, path.basename(result.filePath));
  const reportWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  // HTML-отчёт может содержать встроенную маску PNG огромного экрана (data:
  // URI) и таблицы на сотни кабинетов с кириллицей — через data:text/html +
  // encodeURIComponent() это легко превышает лимит длины URL в Chromium
  // (~2 млн символов, кириллица percent-кодируется в 6 симв. на символ) и
  // падает с ERR_INVALID_URL. Пишем HTML во временный файл и грузим его
  // через loadFile — лимита на размер файла, в отличие от URL, нет.
  const tempHtmlPath = path.join(app.getPath('temp'), `dl-screen-report-${Date.now()}-${Math.round(Math.random() * 1e6)}.html`);
  try {
    await writeFile(tempHtmlPath, html, 'utf8');
    await reportWindow.loadFile(tempHtmlPath);
    await reportWindow.webContents.executeJavaScript(`Promise.all(Array.from(document.images, image => image.decode()))`);
    const pdf = await reportWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: true
    });
    await writeFile(pdfPath, pdf);
    if (masks && masks.length > 0) {
      await Promise.all(masks.map((file) => writeFile(path.join(projectDir, file.name), Buffer.from(file.bytes))));
    }
    return pdfPath;
  } finally {
    reportWindow.destroy();
    await rm(tempHtmlPath, { force: true });
  }
});

function loadRenderer(win: BrowserWindow): void {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    win.loadURL(rendererUrl);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = win;
  win.on('close', (event) => {
    if (!windowDirty || closeFlowInProgress) return;
    event.preventDefault();
    void confirmClose();
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  loadRenderer(win);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
