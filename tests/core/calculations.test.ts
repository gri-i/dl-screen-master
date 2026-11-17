import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { calculateScreenPower } from '../../src/shared/calculations';
import type { CabinetPreset, Screen } from '../../src/shared/types';

const preset: CabinetPreset = {
  id: 'synthetic-preset',
  brand: 'Synthetic',
  model: 'Test 500',
  widthMm: 500,
  heightMm: 500,
  pixelPitchMm: 3.9,
  resolutionX: 128,
  resolutionY: 128,
  weightKg: 12,
  maxPowerW: 150,
  avgPowerW: 60
};

describe('screen power calculations', () => {
  it('calculates layout totals and a peak-power circuit recommendation', () => {
    const screen: Screen = {
      id: 'synthetic-screen',
      name: 'Synthetic screen',
      cols: 3,
      rows: 2,
      cabinets: Array.from({ length: 6 }, (_, index) => ({
        presetId: preset.id,
        col: index % 3,
        row: Math.floor(index / 3)
      }))
    };

    assert.deepEqual(calculateScreenPower(screen, preset, {
      voltage: 230,
      phase: 'single',
      circuitBreakerAmps: 16,
      safetyMarginPercent: 20,
      powerFactor: 0.95
    }), {
      totalCabinets: 6,
      totalWeightKg: 72,
      totalWidthMm: 1500,
      totalHeightMm: 1000,
      totalMaxPowerW: 900,
      totalAvgPowerW: 360,
      recommendedCircuits: { phase: 'single', circuitsNeeded: 1, ampsPerCircuit: 16 }
    });
  });
});
