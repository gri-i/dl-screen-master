import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type { CabinetPreset, Project } from '../shared/types';
import { unzipSync } from 'fflate';

app.setName('DL_SCREEN MASTER');

ipcMain.handle('project:open', async (): Promise<{ filePath: string; project: Project } | null> => {
  const result = await dialog.showOpenDialog({
    title: 'Открыть проект DL_SCREEN MASTER',
    properties: ['openFile'],
    filters: [{ name: 'DL_SCREEN MASTER', extensions: ['dlscreen', 'json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return { filePath, project: JSON.parse(await readFile(filePath, 'utf8')) as Project };
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
  await writeFile(filePath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
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
  await writeFile(presetProfilePath(), `${JSON.stringify(presets, null, 2)}\n`, 'utf8');
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

ipcMain.handle('export:pdf', async (event, html: string, defaultName: string): Promise<string | null> => {
  const result = await dialog.showSaveDialog({
    title: 'Экспорт PDF-отчёта',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return null;
  const reportWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await reportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await reportWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: true
    });
    await writeFile(result.filePath, pdf);
    return result.filePath;
  } finally {
    reportWindow.destroy();
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
