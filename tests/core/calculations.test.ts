import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { calculateScreenPower, powerBoxLines, powerPlanLoads, signalLines } from '../../src/shared/calculations';
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

describe('линии расключения (для коннекторов LED-стены)', () => {
  it('занятые порты контроллера → по линии на порт, номер карты и порта', () => {
    const processor = {
      id: 'p', brand: 'NovaStar', model: 'H9',
      ports: [
        { portId: 'Sending card 1 · Port 7', controllerId: '1', controllerName: 'H9', sourcePortName: '7', maxPixels: 650000, assignedCabinets: ['0-0', '1-0'] },
        { portId: 'Sending card 1 · Port 8', controllerId: '1', controllerName: 'H9', sourcePortName: '8', maxPixels: 650000, assignedCabinets: [] },
        { portId: 'Sending card 2 · Port 1', controllerId: '2', controllerName: 'H9', sourcePortName: '1', maxPixels: 650000, assignedCabinets: ['2-0'] }
      ]
    } as unknown as Parameters<typeof signalLines>[0];
    assert.deepEqual(signalLines(processor), [
      { controller: 'H9', card: 1, port: 7, cabinets: 2 },
      { controller: 'H9', card: 2, port: 1, cabinets: 1 }
    ]);
    assert.deepEqual(signalLines(undefined), []);
  });

  it('силовые коробки: коннектор на коробку, внутри — занятые розетки', () => {
    const plan = {
      voltage: 230, circuitBreakerAmps: 16, safetyMarginPercent: 20, powerFactor: 0.95,
      phases: 3 as const,
      circuits: [
        { id: 'c1', name: 'Цепь 1', phase: 'L1' as const, assignedCabinets: ['0-0'], box: 'b1' },
        { id: 'c2', name: 'Цепь 2', phase: 'L2' as const, assignedCabinets: [], box: 'b1' },
        { id: 'c3', name: 'Цепь 3', phase: 'L3' as const, assignedCabinets: ['1-0', '2-0'], box: 'b2' },
        { id: 'c4', name: 'Цепь 4', phase: 'L1' as const, assignedCabinets: ['3-0'] }
      ],
      boxes: [
        { id: 'b1', name: 'Коробка 1', circuits: ['c1', 'c2'] },
        { id: 'b2', name: 'Коробка 2', circuits: ['c3'] }
      ]
    };
    assert.deepEqual(powerBoxLines(plan), [
      // n — номер розетки ВНУТРИ коробки (цепь 1 — первая розетка коробки 1)
      { name: 'Коробка 1', sockets: [{ circuit: 'Цепь 1', phase: 'L1', cabinets: 1, n: 1 }], input: 'cee32_5p' },
      // цепь 3 — третья розетка коробки 2 (её место в коробке, а не номер цепи плана)
      { name: 'Коробка 2', sockets: [{ circuit: 'Цепь 3', phase: 'L3', cabinets: 2, n: 1 }], input: 'cee32_5p' },
      // цепь без коробки — своей строкой
      { name: 'Цепь 4', sockets: [{ circuit: 'Цепь 4', phase: 'L1', cabinets: 1, n: 1 }] }
    ]);
    assert.deepEqual(powerBoxLines(undefined), []);
    // старый план без boxes: все цепи без коробок
    assert.equal(powerBoxLines({ ...plan, boxes: undefined }).length, 3);
  });
});

describe('розетки коробки: номер внутри коробки (как в масках)', () => {
  it('n — место цепи в коробке, а не номер цепи плана', () => {
    const plan = {
      voltage: 230, circuitBreakerAmps: 16, safetyMarginPercent: 20, powerFactor: 0.95,
      phases: 3 as const,
      circuits: [
        { id: 'c1', name: 'Цепь 7', phase: 'L1' as const, assignedCabinets: [], box: 'b1' },
        { id: 'c2', name: 'Цепь 8', phase: 'L2' as const, assignedCabinets: ['0-0'], box: 'b1' },
        { id: 'c3', name: 'Цепь 9', phase: 'L3' as const, assignedCabinets: ['1-0', '2-0'], box: 'b1' },
      ],
      boxes: [{ id: 'b1', name: 'Коробка 1', circuits: ['c1', 'c2', 'c3'] }],
    };
    const [box] = powerBoxLines(plan);
    // заняты вторая и третья розетки — в дизайн уходят именно «POWER OUT 2» и «3»
    assert.deepEqual(box.sockets.map(s => [s.n, s.cabinets]), [[2, 1], [3, 2]]);
  });
});
