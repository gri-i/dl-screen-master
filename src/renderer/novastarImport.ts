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

export async function importNovaStarSrcx(file: File): Promise<{
  screens: ImportedNovaStarScreen[];
  presets: CabinetPreset[];
}> {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const sceneNames = Object.keys(archive)
    .filter((name) => /^SceneInfo_.*\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (sceneNames.length === 0) throw new Error('В файле не найдены сцены NovaStar');

  const parser = new DOMParser();
  const presetsById = new Map<string, CabinetPreset>();
  const screens: ImportedNovaStarScreen[] = [];

  for (const sceneFileName of sceneNames) {
    const document = parser.parseFromString(strFromU8(archive[sceneFileName]), 'application/xml');
    if (document.querySelector('parsererror')) throw new Error(`Не удалось прочитать ${sceneFileName}`);
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
      name: text(document.documentElement, 'ScreenName') || sceneFileName.replace(/^SceneInfo_|\.xml$/gi, ''),
      config: { presetId, cols, rows, emptyCabinetKeys },
      preset,
      processor,
      sourceCabinetCount: cabinets.length
    });
  }

  if (screens.length === 0) throw new Error('В файле NovaStar нет кабинетов для импорта');
  return { screens, presets: Array.from(presetsById.values()) };
}
