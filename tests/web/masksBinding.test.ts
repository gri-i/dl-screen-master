import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundPowerStorageKey, boundScreenStorageKey, boundThumbnailStorageKey, clearBoundThumbnail,
  readBoundPower, readBoundScreen, readBoundThumbnail, renderThumbnail, writeBoundPower,
  writeBoundScreen, writeBoundThumbnail
} from '../../src/renderer/masksBinding';
import type { BoundPowerSummary } from '../../src/renderer/masksBinding';
import type { ScreenInstance } from '../../src/shared/types';

const screen: ScreenInstance = {
  id: 'w1',
  name: 'Основной экран',
  presetId: 'absen-nt-1.9',
  cols: 8,
  rows: 4,
  emptyCabinetKeys: ['0-0', '7-3'],
  position: { x: 32, y: 32 },
  rotation: 0,
  visualSettings: {
    showCabinetGrid: true,
    showCabinetNumbers: false,
    showTestGrid: false,
    config: { type: 'checkerboard', cellSizePx: 64, colorA: '#000', colorB: '#fff' },
    screenLabel: 'Основной экран',
    labelFontSize: 54,
    textColor: '#ffffff',
    showResolution: false,
    resolutionTextColor: '#ffffff',
    logoSource: null,
    logoPosition: 'top-right',
    logoScalePercent: 20,
    logoOpacityPercent: 50
  }
};

function storage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); }
  } as Storage;
}

test('привязка маски: запись и чтение по id стены', () => {
  const store = storage();
  writeBoundScreen('w1', screen, store);
  assert.equal(boundScreenStorageKey('w1'), 'dl-screen-master-masks-screen:w1');
  const loaded = readBoundScreen('w1', store);
  assert.deepEqual(loaded, screen);
  assert.equal(readBoundScreen('other', store), null);
});

test('привязка маски: битые данные и чужая версия игнорируются', () => {
  const store = storage();
  store.setItem(boundScreenStorageKey('w1'), '{ broken');
  assert.equal(readBoundScreen('w1', store), null);
  store.setItem(boundScreenStorageKey('w1'), JSON.stringify({ version: 99, screen }));
  assert.equal(readBoundScreen('w1', store), null);
  store.setItem(boundScreenStorageKey('w1'), JSON.stringify({ version: 1, screen: { id: 'x' } }));
  assert.equal(readBoundScreen('w1', store), null);
});

test('миниатюра маски: ключ, запись и чтение data URL', async () => {
  const store = storage();
  const png = 'data:image/png;base64,AAAA';
  writeBoundThumbnail('w1', png, store);
  assert.equal(boundThumbnailStorageKey('w1'), 'dl-screen-master-masks-thumb:w1');
  assert.equal(readBoundThumbnail('w1', store), png);
  assert.equal(readBoundThumbnail('other', store), null);
  writeBoundThumbnail('w1', 'not-an-image', store);
  assert.equal(readBoundThumbnail('w1', store), png);
  clearBoundThumbnail('w1', store);
  assert.equal(readBoundThumbnail('w1', store), null);
  assert.equal(await renderThumbnail(png), null);   // в Node без document
});

test('сводка по силовым путям: контроллер экрана и обратная совместимость', () => {
  const store = storage();
  const summary: BoundPowerSummary = {
    phases: 3, voltage: 230, breakerAmps: 16, safetyMarginPercent: 20, powerFactor: 0.95,
    cabinets: 32, assigned: 32, maxPowerW: 4640, avgPowerW: 1536,
    loads: [
      { phase: 'L1', cabinets: 16, maxPowerW: 2320, avgPowerW: 768, amps: 10.6 },
      { phase: 'L2', cabinets: 16, maxPowerW: 2320, avgPowerW: 768, amps: 10.6 },
      { phase: 'L3', cabinets: 0, maxPowerW: 0, avgPowerW: 0, amps: 0 }
    ],
    imbalancePercent: 100, controller: { model: 'H9', ports: 16 },
    signal: [{ controller: 'H9', card: 1, port: 1, cabinets: 16 }],
    boxes: [{ name: 'Коробка 1', sockets: [{ circuit: 'Цепь 1', phase: 'L1', cabinets: 16 }] }],
    updatedAt: '2026-11-18T10:00:00.000Z'
  };
  writeBoundPower('w1', summary, store);
  assert.equal(boundPowerStorageKey('w1'), 'dl-screen-master-masks-power:w1');
  assert.deepEqual(readBoundPower('w1', store)?.controller, { model: 'H9', ports: 16 });

  // сводка без контроллера и линий (старая версия) читается как «не выбран» и пустые линии
  const { controller: _ignored, signal: _sig, boxes: _boxes, ...withoutController } = summary;
  writeBoundPower('w2', withoutController as BoundPowerSummary, store);
  assert.equal(readBoundPower('w2', store)?.controller, null);
  assert.deepEqual(readBoundPower('w2', store)?.signal, []);
  assert.deepEqual(readBoundPower('w2', store)?.boxes, []);
  // линии читаются как есть
  assert.deepEqual(readBoundPower('w1', store)?.signal, [{ controller: 'H9', card: 1, port: 1, cabinets: 16 }]);
  assert.deepEqual(readBoundPower('w1', store)?.boxes?.[0].name, 'Коробка 1');

  // битый контроллер — сводка не читается
  writeBoundPower('w3', { ...summary, controller: { model: 'H9', ports: 'много' } } as unknown as BoundPowerSummary, store);
  assert.equal(readBoundPower('w3', store), null);
  assert.equal(readBoundPower('пусто', store), null);
});
