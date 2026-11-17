import test from 'node:test';
import assert from 'node:assert/strict';
import { installWebBridge, isDesktop, isWeb, parseStoredPresets } from '../../src/renderer/platform';

const preset = {
  id: 'probe', brand: 'Probe', model: 'Web 500', widthMm: 500, heightMm: 500,
  pixelPitchMm: 2.5, resolutionX: 200, resolutionY: 200, weightKg: 7, maxPowerW: 150, avgPowerW: 60
};

test('web platform: node-окружение без preload-моста считается web', () => {
  assert.equal(isDesktop(), false);
  assert.equal(isWeb(), true);
});

test('parseStoredPresets: пустое хранилище и битые данные дают пустую базу', () => {
  assert.deepEqual(parseStoredPresets(null), []);
  assert.deepEqual(parseStoredPresets(''), []);
  assert.deepEqual(parseStoredPresets('{ broken'), []);
  assert.deepEqual(parseStoredPresets('{"presets":[]}'), []);
  assert.deepEqual(parseStoredPresets('"string"'), []);
});

test('parseStoredPresets: массив кабинетов читается как есть', () => {
  const parsed = parseStoredPresets(JSON.stringify([preset]));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].id, 'probe');
  assert.equal(parsed[0].widthMm, 500);
});

test('web platform: первый запуск подставляет каталог рядом с index.html', async () => {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const fakeWindow: any = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, value); }
    }
  };
  (globalThis as any).window = fakeWindow;
  (globalThis as any).document = { baseURI: 'http://127.0.0.1:8081/masks/' };
  (globalThis as any).fetch = async (url: string) => {
    calls.push(url);
    return { ok: true, json: async () => ({ presets: [preset] }) };
  };
  try {
    installWebBridge();
    const loaded = await fakeWindow.presetFiles.load();
    assert.equal(loaded.length, 1);
    assert.equal(calls[0], 'http://127.0.0.1:8081/masks/catalog/cabinet-presets.json');
    assert.equal(store.get('dl-screen-master-cabinet-presets'), JSON.stringify([preset]));
    // Второй запуск читает уже сохранённую библиотеку, каталог не запрашивается.
    await fakeWindow.presetFiles.load();
    assert.equal(calls.length, 1);
  } finally {
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).fetch;
  }
});
