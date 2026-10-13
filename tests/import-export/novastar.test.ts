import { describe, expect, it } from 'vitest';
import { importNovaStarProject } from '../../src/renderer/novastarImport';
import { syntheticMultiCardDsc } from './fixtures';

describe('NovaStar import', () => {
  it('parses a synthetic multi-card DSCI fixture without claiming real SCR validation', async () => {
    const bytes = syntheticMultiCardDsc();
    const file = {
      name: 'synthetic-multicard.scr',
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    } as unknown as File;

    const imported = await importNovaStarProject(file, [], 'en');

    expect(imported.screens).toHaveLength(2);
    expect(imported.screens.map((screen) => screen.name)).toEqual(['Screen1', 'Screen2']);
    expect(imported.screens.map((screen) => screen.sourceCabinetCount)).toEqual([3, 2]);
    expect(imported.screens[0].processor?.model).toBe('Sending card 1');
    expect(imported.screens[1].processor?.model).toBe('Sending card 2');
    expect(imported.screens[0].processor?.ports.map((port) => port.assignedCabinets)).toEqual([
      ['1-0', '0-0'],
      ['0-1']
    ]);
    expect(imported.screens[1].processor?.ports[0].assignedCabinets).toEqual(['1-0', '0-0']);
    expect(imported.screens[0].config.emptyCabinetKeys).toEqual(['1-1']);
    expect(imported.screens[1].config.emptyCabinetKeys).toEqual(['0-1', '1-1']);
  });
});
