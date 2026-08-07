import { strFromU8, unzipSync } from 'fflate';
import type { CabinetPreset, Processor, ProcessorPort } from '@shared/types';
import type { ScreenConfig } from './components/PowerCalculator';

export interface ImportedNovaStarScreen {
  name: string;
  config: ScreenConfig;
  preset: CabinetPreset;
  processor?: Processor;
  sourceCabinetCount: number;
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

function uint16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function uint16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function importNovaStarDsc(fileName: string, bytes: Uint8Array): {
  screens: ImportedNovaStarScreen[];
  presets: CabinetPreset[];
} | null {
  if (!matches(bytes, 0, [0x44, 0x53, 0x43, 0x49])) return null;

  const marker = [0x00, 0x00, 0x01, 0x40, 0x00, 0x01, 0x00, 0x00] as const;
  let bestMarkerOffset = -1;
  let bestCount = 0;

  for (let offset = 4; offset < bytes.length - marker.length; offset += 1) {
    if (!matches(bytes, offset, marker)) continue;
    let count = 0;
    while (matches(bytes, offset + count * 17, marker)) count += 1;
    if (count > bestCount) {
      bestCount = count;
      bestMarkerOffset = offset;
    }
  }

  const recordStart = bestMarkerOffset - 4;
  if (bestCount < 2 || recordStart < 0) {
    throw new Error('Файл SCR распознан как NovaLCT DSCI, но таблица кабинетов не найдена');
  }

  const headerCount = bytes[recordStart - 9] ?? 0;
  if (headerCount >= bestCount && headerCount <= 4096 && recordStart + headerCount * 17 <= bytes.length) {
    bestCount = headerCount;
  }

  const widthFromMarker = uint16be(bytes, bestMarkerOffset + 2);
  const heightFromMarker = uint16le(bytes, bestMarkerOffset + 4);
  const resolutionX = widthFromMarker > 0 ? widthFromMarker : 320;
  const resolutionY = heightFromMarker > 0 ? heightFromMarker : 256;

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
    weightKg: 0,
    maxPowerW: 0,
    avgPowerW: 0
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

function readNovaStarScenes(bytes: Uint8Array, fileName: string): NovaStarSceneSource[] {
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
    if (sceneNames.length === 0) throw new Error('В файле не найдены XML-сцены NovaStar с CabinetInfo');
    return sceneNames.map((name) => ({ name, xml: decodeText(archive[name]) }));
  } catch (error) {
    const rawText = decodeText(bytes);
    if (/^\s*</.test(rawText) && /<CabinetInfo[\s>]/i.test(rawText)) {
      return [{ name: fileBaseName(fileName), xml: rawText }];
    }
    throw error instanceof Error && error.message === 'В файле не найдены XML-сцены NovaStar с CabinetInfo'
      ? error
      : new Error('Формат NovaStar не поддержан: нужен .srcx/.scr архив со сценами или XML-файл с CabinetInfo');
  }
}

export async function importNovaStarProject(file: File): Promise<{
  screens: ImportedNovaStarScreen[];
  presets: CabinetPreset[];
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const binaryImport = importNovaStarDsc(file.name, bytes);
  if (binaryImport) return binaryImport;

  const sceneSources = readNovaStarScenes(bytes, file.name);
  const parser = new DOMParser();
  const presetsById = new Map<string, CabinetPreset>();
  const screens: ImportedNovaStarScreen[] = [];

  for (const scene of sceneSources) {
    const document = parser.parseFromString(scene.xml, 'application/xml');
    if (document.querySelector('parsererror')) throw new Error(`Не удалось прочитать ${scene.name}`);
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
    const presetId = `novastar-${slug(`${brand}-${model}-${resolutionX}x${resolutionY}`)}`;
    const maxPowerW = Math.max(0, number(first, 'cabinetpower', 0));
    const preset: CabinetPreset = {
      id: presetId,
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
    presetsById.set(presetId, preset);

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
      sourceCabinetCount: cabinets.length
    });
  }

  if (screens.length === 0) throw new Error('В файле NovaStar нет кабинетов для импорта');
  return { screens, presets: Array.from(presetsById.values()) };
}

export const importNovaStarSrcx = importNovaStarProject;
