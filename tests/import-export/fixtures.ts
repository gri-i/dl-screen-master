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

/** Synthetic DSCI fixture with two compact screen headers (two sending cards). */
export function syntheticMultiCardDsc(): Uint8Array {
  const firstRecordStart = 32;
  const firstRecordCount = 3;
  const firstHeaderOffset = firstRecordStart + firstRecordCount * 17;
  const secondRecordStart = firstHeaderOffset + 17;
  const secondRecordCount = 2;
  const secondHeaderOffset = secondRecordStart + secondRecordCount * 17;
  const bytes = new Uint8Array(secondHeaderOffset + 17);
  bytes.set([0x44, 0x53, 0x43, 0x49], 0); // DSCI magic.

  const record = (offset: number, col: number, row: number, port: number, order: number): void => {
    bytes[offset] = col * 128;
    bytes[offset + 2] = row;
    bytes[offset + 6] = 128;
    bytes[offset + 8] = 128;
    bytes[offset + 10] = 1;
    bytes[offset + 12] = port;
    bytes[offset + 13] = order;
  };
  const header = (offset: number, senderIndex: number): void => {
    bytes.set([2, 1, 0, 0, 0, 0, 0, 2, 0, 2, 0, senderIndex], offset);
  };

  // Synthetic fixture only: first screen has two ports and a deterministic order.
  record(firstRecordStart, 0, 0, 0, 1);
  record(firstRecordStart + 17, 1, 0, 0, 0);
  record(firstRecordStart + 34, 0, 1, 1, 0);
  header(firstHeaderOffset, 0);

  // Synthetic fixture only: second sending card has its own screen block.
  record(secondRecordStart, 0, 0, 0, 1);
  record(secondRecordStart + 17, 1, 0, 0, 0);
  header(secondHeaderOffset, 1);
  return bytes;
}
