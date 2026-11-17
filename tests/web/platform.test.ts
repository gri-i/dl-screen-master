import test from 'node:test';
import assert from 'node:assert/strict';
import { isDesktop, isWeb, parseStoredPresets } from '../../src/renderer/platform';

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
