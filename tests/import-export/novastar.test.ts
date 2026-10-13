import { describe, expect, it } from 'vitest';
import { importNovaStarProject } from '../../src/renderer/novastarImport';
import { syntheticMultiCardDsc } from './fixtures';

describe('NovaStar import', () => {
  it.each([1, 2, 3])('parses a synthetic %s-card DSCI fixture with previous-header offsets', async (cardCount) => {
    const bytes = syntheticMultiCardDsc(cardCount);
    const file = {
      name: 'synthetic-multicard.scr',
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    } as unknown as File;

    const imported = await importNovaStarProject(file, [], 'en');

    expect(imported.screens).toHaveLength(cardCount);
    expect(imported.screens.map((screen) => screen.name)).toEqual(
      [7, 1, 2].slice(0, cardCount).map((sender) => `Screen${sender}`)
    );
    expect(imported.screens.map((screen) => screen.sourceCabinetCount)).toEqual(Array(cardCount).fill(3));
    expect(imported.screens.map((screen) => screen.processor?.model)).toEqual(
      [7, 1, 2].slice(0, cardCount).map((sender) => `Sending card ${sender}`)
    );
    expect(imported.screens[0].processor?.ports.map((port) => port.assignedCabinets)).toEqual([
      ['1-0', '0-0'],
      ['0-1']
    ]);
    expect(imported.screens[0].processor?.ports.map((port) => [port.controllerId, port.sourcePortName])).toEqual([
      ['7', '1'],
      ['7', '2']
    ]);
    if (cardCount > 1) expect(imported.screens[1].processor?.ports[0].assignedCabinets).toEqual(['1-0', '0-0']);
    expect(imported.screens[0].config.emptyCabinetKeys).toEqual(['1-1']);
  });

  it('skips damaged records while keeping valid port order and physical port fields', async () => {
    const bytes = syntheticMultiCardDsc(2, { damagedCard: 1 });
    const file = {
      name: 'synthetic-damaged.scr',
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    } as unknown as File;

    const imported = await importNovaStarProject(file, [], 'en');

    expect(imported.screens.map((screen) => screen.sourceCabinetCount)).toEqual([3, 2]);
    expect(imported.screens[1].processor?.ports.map((port) => ({
      controllerId: port.controllerId,
      sourcePortName: port.sourcePortName,
      assignedCabinets: port.assignedCabinets
    }))).toEqual([
      { controllerId: '1', sourcePortName: '1', assignedCabinets: ['0-0'] },
      { controllerId: '1', sourcePortName: '2', assignedCabinets: ['0-1'] }
    ]);
  });

  it('keeps an empty card as an empty layout instead of inventing cabinets', async () => {
    const bytes = syntheticMultiCardDsc(3, { emptyCard: 2 });
    const file = {
      name: 'synthetic-empty.scr',
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    } as unknown as File;

    const imported = await importNovaStarProject(file, [], 'en');

    expect(imported.screens[2].sourceCabinetCount).toBe(0);
    expect(imported.screens[2].processor?.ports).toEqual([]);
    expect(imported.screens[2].config.emptyCabinetKeys).toEqual(['0-0', '1-0', '0-1', '1-1']);
  });
});
