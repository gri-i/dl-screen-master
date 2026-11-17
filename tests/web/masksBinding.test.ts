import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundScreenStorageKey, boundThumbnailStorageKey, clearBoundThumbnail, readBoundScreen,
  readBoundThumbnail, renderThumbnail, writeBoundScreen, writeBoundThumbnail
} from '../../src/renderer/masksBinding';
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
