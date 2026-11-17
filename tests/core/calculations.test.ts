import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { calculateScreenPower, powerPlanLoads } from '../../src/shared/calculations';
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

describe('power plan phase loads', () => {
  const plan = {
    voltage: 230,
    circuitBreakerAmps: 16,
    safetyMarginPercent: 20,
    powerFactor: 0.95,
    phases: 3 as const,
    circuits: [
      { id: 'c1', name: 'C1', phase: 'L1' as const, assignedCabinets: ['0-0', '1-0', '2-0'] },
      { id: 'c2', name: 'C2', phase: 'L2' as const, assignedCabinets: ['0-1', '1-1'] },
      { id: 'c3', name: 'C3', phase: 'L3' as const, assignedCabinets: ['0-2'] }
    ]
  };

  it('splits peak power and current per phase the same way the planner does', () => {
    const loads = powerPlanLoads(plan, preset);
    assert.ok(loads);
    assert.equal(loads!.phases, 3);
    assert.equal(loads!.assignedCabinets, 6);
    assert.equal(loads!.maxPowerW, 6 * preset.maxPowerW);
    assert.equal(loads!.avgPowerW, 6 * preset.avgPowerW);
    assert.deepEqual(loads!.loads.map((load) => [load.phase, load.cabinets, load.maxPowerW]),
      [['L1', 3, 450], ['L2', 2, 300], ['L3', 1, 150]]);
    // ток фазы = пик фазы / (фазное напряжение × cosφ), как cabinetAmps в планировщике
    assert.ok(Math.abs(loads!.loads[0].amps - 450 / (230 * 0.95)) < 1e-9);
    assert.equal(loads!.loads[1].cabinets, 2);
    // перекос = (max − min) / среднее
    const amps = loads!.loads.map((load) => load.amps);
    const mean = amps.reduce((sum, value) => sum + value, 0) / 3;
    assert.ok(Math.abs(loads!.imbalancePercent - (Math.max(...amps) - Math.min(...amps)) / mean * 100) < 0.1);
  });

  it('returns null until something is actually routed', () => {
    assert.equal(powerPlanLoads(undefined, preset), null);
    assert.equal(powerPlanLoads({ ...plan, circuits: [] }, preset), null);
    assert.equal(powerPlanLoads({ ...plan, circuits: plan.circuits.map((circuit) => ({ ...circuit, assignedCabinets: [] })) }, preset), null);
  });

  it('single-phase plan reports one L1 row without imbalance', () => {
    const loads = powerPlanLoads({ ...plan, phases: 1 }, preset);
    assert.ok(loads);
    assert.equal(loads!.loads.length, 1);
    assert.equal(loads!.loads[0].phase, 'L1');
    assert.equal(loads!.loads[0].cabinets, 6);
    assert.equal(loads!.imbalancePercent, 0);
  });

  it('counts a cabinet once even if it is assigned to two circuits', () => {
    const doubled = { ...plan, circuits: [
      { id: 'c1', name: 'C1', phase: 'L1' as const, assignedCabinets: ['0-0', '0-0'] },
      { id: 'c2', name: 'C2', phase: 'L2' as const, assignedCabinets: ['0-0'] }
    ] };
    const loads = powerPlanLoads(doubled, preset);
    assert.ok(loads);
    assert.equal(loads!.assignedCabinets, 1);
    assert.equal(loads!.loads[0].cabinets, 1);
    assert.equal(loads!.loads[1].cabinets, 1);
  });
});
