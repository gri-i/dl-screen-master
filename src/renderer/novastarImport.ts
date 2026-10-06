import { strFromU8, unzipSync } from 'fflate';
import type { CabinetPreset, Processor, ProcessorPort } from '@shared/types';
import type { Lang } from '@shared/lang';
import { matchExistingPreset } from '@shared/presetValidation';
import type { ScreenConfig } from './components/PowerCalculator';

const MESSAGES: Record<Lang, {
  dsciNoTable: string;
  noScenes: string;
  unsupportedFormat: string;
  sceneParseFailed: (name: string) => string;
  noCabinets: string;
}> = {
  ru: {
    dsciNoTable: 'Файл SCR распознан как NovaLCT DSCI, но таблица кабинетов не найдена',
    noScenes: 'В файле не найдены XML-сцены NovaStar с CabinetInfo',
    unsupportedFormat: 'Формат NovaStar не поддержан: нужен .srcx/.scr архив со сценами или XML-файл с CabinetInfo',
    sceneParseFailed: (name) => `Не удалось прочитать ${name}`,
    noCabinets: 'В файле NovaStar нет кабинетов для импорта'
  },
  en: {
    dsciNoTable: 'The SCR file looks like a NovaLCT DSCI file, but no cabinet table was found',
    noScenes: 'No NovaStar XML scenes with CabinetInfo were found in the file',
    unsupportedFormat: 'Unsupported NovaStar format: expected a .srcx/.scr scene archive or an XML file with CabinetInfo',
    sceneParseFailed: (name) => `Failed to parse ${name}`,
    noCabinets: 'The NovaStar file has no cabinets to import'
  }
};

export interface ImportedNovaStarScreen {
  name: string;
  config: ScreenConfig;
  preset: CabinetPreset;
  processor?: Processor;
  sourceCabinetCount: number;
  /** Абсолютная позиция сцены в пикселях NovaStar (для объединения по sender). */
  origin?: { x: number; y: number };
  /** true, если кабинет сматчен на уже существующий пресет базы (не новый). */
  matchedExistingPreset?: boolean;
}

function mergeScreensBySendingCard(screens: ImportedNovaStarScreen[]): ImportedNovaStarScreen[] {
  const groups = new Map<string, ImportedNovaStarScreen[]>();
  for (const screen of screens) {
    const cards = new Map((screen.processor?.ports ?? []).map((port) => [`${port.controllerId ?? ''}\u0000${port.controllerName ?? ''}`, port]));
    const [card] = cards.keys();
    const key = card && cards.size === 1 && screen.origin ? `${card}\u0000${screen.preset.id}` : `screen\u0000${screen.name}`;
    groups.set(key, [...(groups.get(key) ?? []), screen]);
  }

  return Array.from(groups.values(), (group) => {
    if (group.length === 1) return group[0];
    const preset = group[0].preset;
    const minX = Math.min(...group.map((screen) => screen.origin!.x));
    const minY = Math.min(...group.map((screen) => screen.origin!.y));
    const occupied = new Set<string>();
    const ports = new Map<string, ProcessorPort>();
    let cols = 0;
    let rows = 0;
    for (const screen of group) {
      const offsetCol = Math.round((screen.origin!.x - minX) / preset.resolutionX);
      const offsetRow = Math.round((screen.origin!.y - minY) / preset.resolutionY);
      for (let row = 0; row < screen.config.rows; row += 1) for (let col = 0; col < screen.config.cols; col += 1) {
        const oldKey = `${col}-${row}`;
        if (screen.config.emptyCabinetKeys.includes(oldKey)) continue;
        occupied.add(`${col + offsetCol}-${row + offsetRow}`);
      }
      cols = Math.max(cols, offsetCol + screen.config.cols);
      rows = Math.max(rows, offsetRow + screen.config.rows);
      for (const port of screen.processor?.ports ?? []) {
        const current = ports.get(port.portId) ?? { ...port, assignedCabinets: [] };
        current.assignedCabinets.push(...port.assignedCabinets.map((key) => {
          const [col, row] = key.split('-').map(Number);
          return `${col + offsetCol}-${row + offsetRow}`;
        }));
        ports.set(port.portId, current);
      }
    }
    const emptyCabinetKeys: string[] = [];
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
      const key = `${col}-${row}`;
      if (!occupied.has(key)) emptyCabinetKeys.push(key);
    }
    const firstPort = ports.values().next().value as ProcessorPort;
    return {
      name: `Sending card ${firstPort.controllerId ?? ''}${firstPort.controllerName ? ` · ${firstPort.controllerName}` : ''}`,
      config: { presetId: preset.id, cols, rows, emptyCabinetKeys }, preset,
      processor: { id: crypto.randomUUID(), brand: 'NovaStar', model: firstPort.controllerName ?? 'Sending card', ports: Array.from(ports.values()) },
      sourceCabinetCount: occupied.size, origin: { x: minX, y: minY }
    };
  });
}

function text(element: Element, tag: string): string {
  return element.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';
}

function number(element: Element, tag: string, fallback = 0): number {
  const value = Number(text(element, tag));
  return Number.isFinite(value) ? value : fallback;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function directText(element: Element, tag: string): string {
  return Array.from(element.children).find((child) => child.tagName === tag)?.textContent?.trim() ?? '';
}

interface NovaStarSceneSource {
  name: string;
  xml: string;
}

function fileBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const zeroEven = bytes.slice(0, Math.min(bytes.length, 80)).filter((_, index) => index % 2 === 0 && bytes[index] === 0).length;
  const zeroOdd = bytes.slice(0, Math.min(bytes.length, 80)).filter((_, index) => index % 2 === 1 && bytes[index] === 0).length;
  if (zeroOdd > zeroEven * 2) return new TextDecoder('utf-16le').decode(bytes);
  if (zeroEven > zeroOdd * 2) return new TextDecoder('utf-16be').decode(bytes);
  return strFromU8(bytes);
}

function matches(bytes: Uint8Array, offset: number, pattern: readonly number[]): boolean {
  if (offset < 0 || offset + pattern.length > bytes.length) return false;
  return pattern.every((value, index) => bytes[offset + index] === value);
}

interface DscScreenHeader {
  senderIndex: number;
  cols: number;
  rows: number;
  resolutionX: number;
  resolutionY: number;
  headerOffset: number;
  recordStart: number;
}

/**
 * Первая таблица DSCI не содержит компактного заголовка размера экрана.
 * В записях по 17 байт хранятся номер колонки (byte 0) и номер кабинета
 * (byte 3); соседнее число — это общее количество кабинетов, не колонки.
 */
function readFirstDscGrid(bytes: Uint8Array, recordStart: number): Pick<DscScreenHeader, 'cols' | 'rows'> | null {
  const columns = new Map<number, number>();
  for (let offset = recordStart; offset + 17 <= bytes.length; offset += 17) {
    const isCabinetRecord =
      bytes[offset + 1] === 0 && bytes[offset + 2] === 0 &&
      bytes[offset + 4] === 0 && bytes[offset + 5] === 0 &&
      bytes[offset + 6] === 1 && bytes[offset + 7] === 64 &&
      bytes[offset + 8] === 0 && bytes[offset + 9] === 1 && bytes[offset + 10] === 0;
    if (!isCabinetRecord) break;
    const column = bytes[offset];
    columns.set(column, (columns.get(column) ?? 0) + 1);
  }
  if (columns.size === 0) return null;
  return { cols: columns.size, rows: Math.max(...columns.values()) };
}

/** Находит начало первой таблицы кабинетов в двух вариантах бинарного DSCI. */
function findDscRecordStart(bytes: Uint8Array): { recordStart: number; count: number } | null {
  const legacyMarker = [0x00, 0x00, 0x01, 0x40, 0x00, 0x01, 0x00, 0x00] as const;
  let best: { recordStart: number; count: number } | null = null;

  for (let offset = 4; offset < bytes.length - legacyMarker.length; offset += 1) {
    if (!matches(bytes, offset, legacyMarker)) continue;
    let count = 0;
    while (matches(bytes, offset + count * 17, legacyMarker)) count += 1;
    if (!best || count > best.count) best = { recordStart: offset - 4, count };
  }
  if (best && best.recordStart >= 0) return best;

  // В другом варианте DSCI запись начинается с координат кабинета, а в
  // байтах 6–9 содержится его разрешение (например, 128 × 128).
  for (let offset = 0; offset + 51 <= bytes.length; offset += 1) {
    const width = bytes[offset + 6] | (bytes[offset + 7] << 8);
    const height = bytes[offset + 8] | (bytes[offset + 9] << 8);
    const looksLikeRecord = width >= 16 && width <= 4096 && height >= 16 && height <= 4096 && bytes[offset + 10] === 1;
    if (!looksLikeRecord) continue;
    let count = 0;
    while (offset + count * 17 + 17 <= bytes.length) {
      const recordOffset = offset + count * 17;
      const recordWidth = bytes[recordOffset + 6] | (bytes[recordOffset + 7] << 8);
      const recordHeight = bytes[recordOffset + 8] | (bytes[recordOffset + 9] << 8);
      if (recordWidth !== width || recordHeight !== height || bytes[recordOffset + 10] !== 1) break;
      count += 1;
    }
    if (count >= 2 && (!best || count > best.count)) best = { recordStart: offset, count };
  }
  return best;
}

function readDscScreenHeaders(bytes: Uint8Array, firstRecordStart: number, firstResolution: Pick<DscScreenHeader, 'resolutionX' | 'resolutionY'>): DscScreenHeader[] {
  const headerOffsets: number[] = [];

  // Subsequent NovaLCT screen blocks contain a compact header:
  // 02 01 00 00 00 00 00 <rows> 00 <cols> 00 <sending card index>.
  for (let offset = 0; offset <= bytes.length - 12; offset += 1) {
    if (!matches(bytes, offset, [0x02, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00])) continue;
    const rows = bytes[offset + 7];
    const cols = bytes[offset + 9];
    if (bytes[offset + 8] !== 0 || bytes[offset + 10] !== 0 || cols === 0 || rows === 0 || cols > 100 || rows > 100) continue;
    if (!headerOffsets.includes(offset)) headerOffsets.push(offset);
  }

  if (headerOffsets.length > 0) {
    return headerOffsets.map((headerOffset, index) => ({
      senderIndex: bytes[headerOffset + 11],
      cols: bytes[headerOffset + 9],
      rows: bytes[headerOffset + 7],
      ...firstResolution,
      headerOffset,
      // The first compact header closes the first table; every next table
      // starts immediately after the preceding compact header.
      recordStart: index === 0 ? firstRecordStart : headerOffset + 17
    }));
  }

  const firstGrid = readFirstDscGrid(bytes, firstRecordStart);
  return firstGrid
    ? [{ senderIndex: 0, ...firstGrid, ...firstResolution, headerOffset: -1, recordStart: firstRecordStart }]
    : [];
}

interface DscCabinetRecord {
  key: string;
  port: number;
  order: number;
  sequence: number;
}

function readDscCabinetRecords(bytes: Uint8Array, header: DscScreenHeader, nextHeaderOffset: number): DscCabinetRecord[] {
  const records: DscCabinetRecord[] = [];
  for (let offset = header.recordStart, sequence = 0; offset + 17 <= nextHeaderOffset; offset += 17, sequence += 1) {
    if (bytes[offset + 6] !== 128 || bytes[offset + 8] !== 128 || bytes[offset + 10] !== 1) continue;
    const colPixels = bytes[offset] | (bytes[offset + 1] << 8);
    const row = bytes[offset + 2] | (bytes[offset + 3] << 8);
    if (colPixels % 128 !== 0) continue;
    const col = colPixels / 128;
    if (col < 0 || col >= header.cols || row < 0 || row >= header.rows) continue;
    records.push({ key: `${col}-${row}`, port: bytes[offset + 12], order: bytes[offset + 13], sequence });
  }
  return records;
}

function dscPortsFromRecords(header: DscScreenHeader, records: DscCabinetRecord[]): ProcessorPort[] {
  const senderNumber = header.senderIndex + 1;
  const groups = new Map<number, DscCabinetRecord[]>();
  const assigned = new Set<string>();
  records.forEach((record) => groups.set(record.port, [...(groups.get(record.port) ?? []), record]));
  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([port, group]) => ({
      portId: `Sending card ${senderNumber} · Port ${port + 1}`,
      controllerId: String(senderNumber),
      controllerName: `Sending card ${senderNumber}`,
      sourcePortName: String(port + 1),
      maxPixels: 650000,
      assignedCabinets: group
        .sort((a, b) => a.order - b.order || a.sequence - b.sequence)
        .map((record) => record.key)
        .filter((key) => {
          if (assigned.has(key)) return false;
          assigned.add(key);
          return true;
        })
    }));
}

function buildDscImport(fileName: string, bytes: Uint8Array, headers: DscScreenHeader[]): {
  screens: ImportedNovaStarScreen[];
  presets: CabinetPreset[];
} {
  const presets = new Map<string, CabinetPreset>();
  const screens = headers.map((header, index) => {
    const model = `SCR ${header.resolutionX}x${header.resolutionY}`;
    const presetId = `novalct-${slug(`${fileBaseName(fileName)}-${model}`)}`;
    let preset = presets.get(presetId);
    if (!preset) {
      preset = {
        id: presetId,
        brand: 'NovaLCT',
        model,
        widthMm: header.resolutionX,
        heightMm: header.resolutionY,
        pixelPitchMm: 1,
        resolutionX: header.resolutionX,
        resolutionY: header.resolutionY,
        // В бинарном DSCI/SCR нет паспортных веса и мощности кабинета.
        weightKg: 0.01,
        maxPowerW: 0.1,
        avgPowerW: 0.1
      };
      presets.set(presetId, preset);
    }

    const nextHeaderOffset = index === 0
      ? header.headerOffset
      : headers[index + 1]?.headerOffset ?? bytes.length;
    const records = readDscCabinetRecords(bytes, header, nextHeaderOffset);
    const assignedCabinets = Array.from(new Set(records.map((record) => record.key)));
    const senderNumber = header.senderIndex + 1;
    const processor: Processor = {
      id: `novalct-sending-${senderNumber}`,
      brand: 'NovaStar',
      model: `Sending card ${senderNumber}`,
      ports: dscPortsFromRecords(header, records)
    };

    const emptyCabinetKeys: string[] = [];
    for (let row = 0; row < header.rows; row += 1) {
      for (let col = 0; col < header.cols; col += 1) {
        if (!assignedCabinets.includes(`${col}-${row}`)) emptyCabinetKeys.push(`${col}-${row}`);
      }
    }

    return {
      name: `Screen${senderNumber}`,
      config: { presetId, cols: header.cols, rows: header.rows, emptyCabinetKeys },
      preset,
      processor,
      sourceCabinetCount: assignedCabinets.length,
      origin: { x: 0, y: 0 }
    };
  });

  return { screens, presets: Array.from(presets.values()) };
}

function importNovaStarDsc(fileName: string, bytes: Uint8Array, lang: Lang): {
  screens: ImportedNovaStarScreen[];
  presets: CabinetPreset[];
} | null {
  if (!matches(bytes, 0, [0x44, 0x53, 0x43, 0x49])) return null;

  const recordTable = findDscRecordStart(bytes);
  if (!recordTable) {
    throw new Error(MESSAGES[lang].dsciNoTable);
  }
  const { recordStart } = recordTable;
  let bestCount = recordTable.count;

  // 00 00 01 40 00 01 — служебный маркер записи DSCI, а не разрешение
  // кабинета. В этом SCR конфигурация receiver card задаёт 128 × 128 px.
  // Эти значения дают корректную нагрузку: 40 кабинетов на порту = 655 360 px.
  const resolutionX = 128;
  const resolutionY = 128;

  const screenHeaders = readDscScreenHeaders(bytes, recordStart, { resolutionX, resolutionY });
  if (screenHeaders.some((header) => header.headerOffset >= 0)) return buildDscImport(fileName, bytes, screenHeaders);

  const headerCount = bytes[recordStart - 9] ?? 0;
  if (headerCount >= bestCount && headerCount <= 4096 && recordStart + headerCount * 17 <= bytes.length) {
    bestCount = headerCount;
  }

  const columns = new Map<number, number[]>();
  for (let index = 0; index < bestCount; index += 1) {
    const offset = recordStart + index * 17;
    const col = bytes[offset];
    const order = bytes[offset + 3];
    const column = columns.get(col) ?? [];
    column.push(order);
    columns.set(col, column);
  }

  const sortedColumns = Array.from(columns.keys()).sort((a, b) => a - b);
  const cols = Math.max(1, sortedColumns.length);
  const rows = Math.max(1, ...Array.from(columns.values(), (items) => items.length));
  const occupied = new Set<string>();
  sortedColumns.forEach((sourceCol, col) => {
    const rowCount = columns.get(sourceCol)?.length ?? 0;
    for (let row = 0; row < rowCount; row += 1) occupied.add(`${col}-${row}`);
  });

  const emptyCabinetKeys: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const key = `${col}-${row}`;
      if (!occupied.has(key)) emptyCabinetKeys.push(key);
    }
  }

  const model = `SCR ${resolutionX}x${resolutionY}`;
  const presetId = `novalct-${slug(`${fileBaseName(fileName)}-${model}`)}`;
  const preset: CabinetPreset = {
    id: presetId,
    brand: 'NovaLCT',
    model,
    widthMm: resolutionX,
    heightMm: resolutionY,
    pixelPitchMm: 1,
    resolutionX,
    resolutionY,
    weightKg: 0.01,
    maxPowerW: 0.1,
    avgPowerW: 0.1
  };

  return {
    screens: [{
      name: fileBaseName(fileName),
      config: { presetId, cols, rows, emptyCabinetKeys },
      preset,
      sourceCabinetCount: occupied.size
    }],
    presets: [preset]
  };
}

function readNovaStarScenes(bytes: Uint8Array, fileName: string, lang: Lang): NovaStarSceneSource[] {
  try {
    const archive = unzipSync(bytes);
    let sceneNames = Object.keys(archive)
      .filter((name) => /^SceneInfo_.*\.xml$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (sceneNames.length === 0) {
      sceneNames = Object.keys(archive)
        .filter((name) => /\.xml$/i.test(name))
        .filter((name) => /<CabinetInfo[\s>]/i.test(decodeText(archive[name])))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    if (sceneNames.length === 0) throw new Error(MESSAGES[lang].noScenes);
    return sceneNames.map((name) => ({ name, xml: decodeText(archive[name]) }));
  } catch (error) {
    const rawText = decodeText(bytes);
    if (/^\s*</.test(rawText) && /<CabinetInfo[\s>]/i.test(rawText)) {
      return [{ name: fileBaseName(fileName), xml: rawText }];
    }
    throw error instanceof Error && error.message === MESSAGES[lang].noScenes
      ? error
      : new Error(MESSAGES[lang].unsupportedFormat);
  }
}

export async function importNovaStarProject(file: File, existingPresets: CabinetPreset[] = [], lang: Lang = 'ru'): Promise<{
  screens: ImportedNovaStarScreen[];
  presets: CabinetPreset[];
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const binaryImport = importNovaStarDsc(file.name, bytes, lang);
  if (binaryImport) return binaryImport;

  const sceneSources = readNovaStarScenes(bytes, file.name, lang);
  const parser = new DOMParser();
  const presetsById = new Map<string, CabinetPreset>();
  const screens: ImportedNovaStarScreen[] = [];

  for (const scene of sceneSources) {
    const document = parser.parseFromString(scene.xml, 'application/xml');
    if (document.querySelector('parsererror')) throw new Error(MESSAGES[lang].sceneParseFailed(scene.name));
    const cabinets = Array.from(document.getElementsByTagName('CabinetInfo'));
    if (cabinets.length === 0) continue;

    const first = cabinets[0];
    const resolutionX = Math.max(1, number(first, 'Width', 128));
    const resolutionY = Math.max(1, number(first, 'Height', 128));
    const brand = text(first, 'Factory') || 'NovaStar';
    const model = text(first, 'Name') || `${resolutionX}x${resolutionY}`;
    let widthMm = Math.max(1, number(first, 'cabinetsize', 500));
    let heightMm = Math.max(1, number(first, 'cabinetHsize', 500));
    const gridPitches = Array.from(model.matchAll(/\d+(?:[.,]\d+)?/g), (match) =>
      Number(match[0].replace(',', '.'))
    ).filter(Number.isFinite);
    if (/grid/i.test(model) && gridPitches.length >= 2) {
      widthMm = Math.max(1, Math.round((resolutionX * gridPitches[0]) / 10) * 10);
      heightMm = Math.max(1, Math.round((resolutionY * gridPitches[1]) / 10) * 10);
    }
    const maxPowerW = Math.max(0, number(first, 'cabinetpower', 0));
    const parsedPreset: CabinetPreset = {
      id: `novastar-${slug(`${brand}-${model}-${resolutionX}x${resolutionY}`)}`,
      brand,
      model,
      widthMm,
      heightMm,
      pixelPitchMm: Number((widthMm / resolutionX).toFixed(3)),
      resolutionX,
      resolutionY,
      weightKg: Math.max(0, number(first, 'cabinetweight', 0)),
      maxPowerW,
      avgPowerW: Math.round(maxPowerW * 0.4)
    };
    // Сопоставляем с уже существующим в базе пресетом (по brand+model, затем
    // по разрешению) — чтобы повторный импорт того же кабинета не плодил
    // дубликаты "novastar-brand-model-...", а использовал реальные
    // вес/мощность/мм уже заведённого пресета.
    const existingMatch = matchExistingPreset([...existingPresets, ...presetsById.values()], parsedPreset);
    const preset = existingMatch ?? parsedPreset;
    const presetId = preset.id;
    if (!existingMatch) presetsById.set(presetId, preset);

    const rawPositions = cabinets.map((cabinet) => ({
      x: number(cabinet, 'ScenePosX'),
      y: number(cabinet, 'ScenePosY'),
      cabinet
    }));
    const minX = Math.min(...rawPositions.map((position) => position.x));
    const minY = Math.min(...rawPositions.map((position) => position.y));
    const cabinetRecords = rawPositions.map((position) => {
      const col = Math.max(0, Math.round((position.x - minX) / resolutionX));
      const row = Math.max(0, Math.round((position.y - minY) / resolutionY));
      const device = position.cabinet.getElementsByTagName('DeviceBaseInfo')[0];
      return {
        key: `${col}-${row}`,
        controllerId: device ? text(device, 'PortName') : '',
        controllerName: device ? text(device, 'DeviceName') : '',
        portName: directText(position.cabinet, 'Port'),
        order: Number(directText(position.cabinet, 'Connect'))
      };
    });
    const occupied = new Set(cabinetRecords.map((record) => record.key));
    const coordinates = Array.from(occupied, (key) => key.split('-').map(Number));
    const cols = Math.max(1, ...coordinates.map(([col]) => col + 1));
    const rows = Math.max(1, ...coordinates.map(([, row]) => row + 1));
    const emptyCabinetKeys: string[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const key = `${col}-${row}`;
        if (!occupied.has(key)) emptyCabinetKeys.push(key);
      }
    }

    const portGroups = new Map<string, typeof cabinetRecords>();
    for (const record of cabinetRecords) {
      if (!record.portName || !record.controllerName || !Number.isFinite(record.order)) continue;
      const groupKey = `${record.controllerId}\u0000${record.controllerName}\u0000${record.portName}`;
      const group = portGroups.get(groupKey) ?? [];
      group.push(record);
      portGroups.set(groupKey, group);
    }
    const ports: ProcessorPort[] = Array.from(portGroups.values())
      .sort((a, b) => a[0].controllerId.localeCompare(b[0].controllerId, undefined, { numeric: true }) || Number(a[0].portName) - Number(b[0].portName))
      .map((group) => {
        const source = group[0];
        const controllerNumber = source.controllerId.match(/\d+/)?.[0] ?? source.controllerId;
        const physicalPort = Number.isFinite(Number(source.portName)) ? Number(source.portName) + 1 : source.portName;
        return {
          portId: `${source.controllerName}-${controllerNumber} · Port ${physicalPort}`,
          controllerId: source.controllerId,
          controllerName: source.controllerName,
          sourcePortName: String(physicalPort),
          maxPixels: 650000,
          assignedCabinets: [...group].sort((a, b) => a.order - b.order).map((record) => record.key)
        };
      });
    const deviceNames = Array.from(new Set(ports.map((port) => port.controllerName).filter(Boolean)));
    const processor: Processor | undefined = ports.length > 0 ? {
      id: crypto.randomUUID(),
      brand: 'NovaStar',
      model: deviceNames.join(' + ') || 'Imported system',
      ports
    } : undefined;

    screens.push({
      name: text(document.documentElement, 'ScreenName') || scene.name.replace(/^SceneInfo_|\.xml$/gi, ''),
      config: { presetId, cols, rows, emptyCabinetKeys },
      preset,
      processor,
      sourceCabinetCount: cabinets.length,
      origin: { x: minX, y: minY },
      matchedExistingPreset: !!existingMatch
    });
  }

  if (screens.length === 0) throw new Error(MESSAGES[lang].noCabinets);
  return { screens: mergeScreensBySendingCard(screens), presets: Array.from(presetsById.values()) };
}

export const importNovaStarSrcx = importNovaStarProject;
