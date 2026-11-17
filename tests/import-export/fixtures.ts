import type { ExportScreen } from '../../src/renderer/projectExport';
import type { CabinetPreset, PowerPlan, Processor } from '../../src/shared/types';

// Synthetic fixture: no real SCR/SRCX or Resolume file is included in this repository.
export const syntheticPreset: CabinetPreset = {
  id: 'synthetic-preset',
  brand: 'Synthetic',
  model: 'Test 128',
  widthMm: 500,
  heightMm: 500,
  pixelPitchMm: 3.9,
  resolutionX: 128,
  resolutionY: 128,
  weightKg: 12,
  maxPowerW: 150,
  avgPowerW: 60,
  receiverCardName: 'Synthetic receiver'
};

export const syntheticProcessor: Processor = {
  id: 'synthetic-processor',
  brand: 'NovaStar',
  model: 'Synthetic controller',
  ports: [
    {
      portId: 'P1',
      controllerId: '1',
      controllerName: 'Sending card 1',
      sourcePortName: '1',
      maxPixels: 650000,
      assignedCabinets: ['0-0', '1-0']
    },
    {
      portId: 'P2',
      controllerId: '2',
      controllerName: 'Sending card 2',
      sourcePortName: '2',
      maxPixels: 650000,
      assignedCabinets: ['0-1', '1-1']
    }
  ]
};

export const syntheticPowerPlan: PowerPlan = {
  voltage: 230,
  circuitBreakerAmps: 16,
  safetyMarginPercent: 20,
  powerFactor: 0.95,
  phases: 1,
  circuits: [
    { id: 'circuit-1', name: 'Synthetic circuit 1', phase: 'L1', assignedCabinets: ['0-0', '1-0'] },
    { id: 'circuit-2', name: 'Synthetic circuit 2', phase: 'L1', assignedCabinets: ['0-1', '1-1'] }
  ]
};

export function syntheticScreen(overrides: Partial<ExportScreen> = {}): ExportScreen {
  return {
    id: 'synthetic-screen',
    name: 'Synthetic screen',
    preset: syntheticPreset,
    cols: 2,
    rows: 2,
    emptyCabinetKeys: [],
    x: 10,
    y: 20,
    width: 256,
    height: 256,
    rotation: 0,
    processor: syntheticProcessor,
    powerPlan: syntheticPowerPlan,
    ...overrides
  };
}

/**
 * Synthetic DSCI fixture derived from the local h15_v3.scr structure:
 * DSCI magic, 17-byte 128x128 records, padding, then one compact header after
 * each table. The real file is not copied into the repository.
 */
export function syntheticMultiCardDsc(cardCount = 2, options: { damagedCard?: number; emptyCard?: number } = {}): Uint8Array {
  const firstRecordStart = 32;
  const recordsPerCard = 3;
  const paddingBytes = 8;
  const blockBytes = recordsPerCard * 17 + paddingBytes + 17;
  const bytes = new Uint8Array(firstRecordStart + cardCount * blockBytes);
  bytes.set([0x44, 0x53, 0x43, 0x49], 0); // DSCI magic.

  const record = (offset: number, col: number, row: number, port: number, order: number): void => {
    const colPixels = col * 128;
    bytes[offset] = colPixels & 0xff;
    bytes[offset + 1] = colPixels >> 8;
    bytes[offset + 2] = row & 0xff;
    bytes[offset + 3] = row >> 8;
    bytes[offset + 6] = 128;
    bytes[offset + 8] = 128;
    bytes[offset + 10] = 1;
    bytes[offset + 12] = port;
    bytes[offset + 13] = order;
  };
  const header = (offset: number, senderIndex: number): void => {
    bytes.set([2, 1, 0, 0, 0, 0, 0, 2, 0, 2, 0, senderIndex], offset);
  };

  const senderIndices = [6, 0, 1];
  for (let card = 0; card < cardCount; card += 1) {
    const tableStart = firstRecordStart + card * blockBytes;
    const headerOffset = tableStart + recordsPerCard * 17 + paddingBytes;
    const isEmpty = options.emptyCard === card;
    const isDamaged = options.damagedCard === card;

    // Synthetic fixture only: preserve physical port and cabinet order fields.
    record(tableStart, isEmpty ? 9 : 0, 0, 0, 1);
    record(tableStart + 17, isEmpty ? 9 : 1, 0, 0, 0);
    record(tableStart + 34, isEmpty ? 9 : 0, 1, 1, 0);
    if (isDamaged) bytes[tableStart + 17 + 6] = 127;
    header(headerOffset, senderIndices[card] ?? card);
  }
  return bytes;
}
