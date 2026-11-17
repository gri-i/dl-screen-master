import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { importNovaStarProject } from '../../src/renderer/novastarImport';
import { syntheticMultiCardDsc } from './fixtures';

describe('NovaStar import', () => {
  for (const cardCount of [1, 2, 3]) it(`parses a synthetic ${cardCount}-card DSCI fixture with previous-header offsets`, async () => {
    const bytes = syntheticMultiCardDsc(cardCount);
    const file = {
      name: 'synthetic-multicard.scr',
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    } as unknown as File;

    const imported = await importNovaStarProject(file, [], 'en');

    assert.equal(imported.screens.length, cardCount);
    assert.deepEqual(imported.screens.map((screen) => screen.name),
      [7, 1, 2].slice(0, cardCount).map((sender) => `Screen${sender}`)
    );
    assert.deepEqual(imported.screens.map((screen) => screen.sourceCabinetCount), Array(cardCount).fill(3));
    assert.deepEqual(imported.screens.map((screen) => screen.processor?.model),
      [7, 1, 2].slice(0, cardCount).map((sender) => `Sending card ${sender}`)
    );
    assert.deepEqual(imported.screens[0].processor?.ports.map((port) => port.assignedCabinets), [
      ['1-0', '0-0'],
      ['0-1']
    ]);
    assert.deepEqual(imported.screens[0].processor?.ports.map((port) => [port.controllerId, port.sourcePortName]), [
      ['7', '1'],
      ['7', '2']
    ]);
    if (cardCount > 1) assert.deepEqual(imported.screens[1].processor?.ports[0].assignedCabinets, ['1-0', '0-0']);
    assert.deepEqual(imported.screens[0].config.emptyCabinetKeys, ['1-1']);
  });

  it('skips damaged records while keeping valid port order and physical port fields', async () => {
    const bytes = syntheticMultiCardDsc(2, { damagedCard: 1 });
    const file = {
      name: 'synthetic-damaged.scr',
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    } as unknown as File;

    const imported = await importNovaStarProject(file, [], 'en');

    assert.deepEqual(imported.screens.map((screen) => screen.sourceCabinetCount), [3, 2]);
    assert.deepEqual(imported.screens[1].processor?.ports.map((port) => ({
      controllerId: port.controllerId,
      sourcePortName: port.sourcePortName,
      assignedCabinets: port.assignedCabinets
    })), [
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

    assert.equal(imported.screens[2].sourceCabinetCount, 0);
    assert.deepEqual(imported.screens[2].processor?.ports, []);
    assert.deepEqual(imported.screens[2].config.emptyCabinetKeys, ['0-0', '1-0', '0-1', '1-1']);
  });
});
