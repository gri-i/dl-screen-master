import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { cabinetMaskPixels, cabinetMaskSize, cabinetPhysicalPixels } from '../../src/shared/cabinetMask';
import { validatePreset } from '../../src/shared/presetValidation';
import type { CabinetPreset } from '../../src/shared/types';

function preset(overrides: Partial<CabinetPreset> = {}): CabinetPreset {
  return {
    id: 'test', brand: 'Test', model: 'Cabinet', widthMm: 500, heightMm: 500,
    pixelPitchMm: 2.5, resolutionX: 200, resolutionY: 200,
    weightKg: 6, maxPowerW: 200, avgPowerW: 80,
    ...overrides
  };
}

describe('cabinet mask geometry', () => {
  it('keeps the physical resolution for a cabinet with square pixels', () => {
    const square = preset();
    assert.deepEqual(cabinetMaskSize(square), { width: 200, height: 200 });
  });

  it('stretches a 256x64 transparent cabinet to a 256x128 content mask', () => {
    const transparent = preset({
      id: 'yestech-mt', brand: 'Yestech', model: 'LED MT P 3.9-7.8',
      widthMm: 1000, heightMm: 500, pixelPitchMm: 3.9,
      resolutionX: 256, resolutionY: 64
    });
    assert.deepEqual(cabinetMaskSize(transparent), { width: 256, height: 128 });
    // Порт считает физические пиксели, маска — только контент.
    assert.equal(cabinetPhysicalPixels(transparent), 256 * 64);
    assert.equal(cabinetMaskPixels(transparent), 256 * 128);
  });

  it('uses explicit mask dimensions when they are provided', () => {
    const custom = preset({ maskResolutionX: 300, maskResolutionY: 150 });
    assert.deepEqual(cabinetMaskSize(custom), { width: 300, height: 150 });
  });

  it('falls back to the physical resolution when the aspect difference is small', () => {
    // 500 × 510 мм при 200 × 200 px — рамка 10 мм, а не неквадратный пиксель.
    const framed = preset({ heightMm: 510 });
    assert.deepEqual(cabinetMaskSize(framed), { width: 200, height: 200 });
  });

  it('requires mask X and Y together and validates their range', () => {
    const half = preset({ maskResolutionX: 256 });
    assert.match(validatePreset(half, 'ru').join(' '), /обе стороны/i);
    const wrong = preset({ maskResolutionX: 256, maskResolutionY: 0 });
    assert.match(validatePreset(wrong, 'ru').join(' '), /maskResolutionY/i);
    assert.deepEqual(validatePreset(preset({ maskResolutionX: 256, maskResolutionY: 128 }), 'ru'), []);
  });
});
