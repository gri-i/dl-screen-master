import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { generateCabinetOrder, generatePowerPlan, routeProcessor } from '../../src/shared/autoRouting';
import type { Processor } from '../../src/shared/types';

describe('automatic routing', () => {
  it('generates snake order from a corner while skipping empty cabinets', () => {
    assert.deepEqual(generateCabinetOrder(
      { cols: 3, rows: 2, emptyCabinetKeys: ['1-0'] },
      'snake-rows',
      'top-left'
    ), ['0-0', '2-0', '2-1', '1-1', '0-1']);
  });

  it('fills processor ports by signal capacity and keeps order', () => {
    const processor: Processor = {
      id: 'synthetic-processor',
      brand: 'Synthetic',
      model: 'Test processor',
      ports: [
        { portId: 'P1', maxPixels: 256, assignedCabinets: [] },
        { portId: 'P2', maxPixels: 256, assignedCabinets: [] }
      ]
    };

    const routed = routeProcessor(processor, ['0-0', '1-0', '2-0', '0-1', '1-1'], 64);
    assert.deepEqual(routed.ports.map((port) => port.assignedCabinets), [
      ['0-0', '1-0', '2-0', '0-1'],
      ['1-1']
    ]);
  });

  it('creates named multi-phase power circuits with a manual cabinet limit', () => {
    const plan = generatePowerPlan({
      voltage: 230,
      circuitBreakerAmps: 16,
      safetyMarginPercent: 20,
      powerFactor: 0.95,
      phases: 3
    }, ['0-0', '1-0', '2-0', '0-1', '1-1'], 150, 2, (number) => `Synthetic ${number}`);

    assert.equal(plan.circuits.length, 3);
    assert.deepEqual(plan.circuits.map((circuit) => circuit.name), ['Synthetic 1', 'Synthetic 2', 'Synthetic 3']);
    assert.deepEqual(plan.circuits.map((circuit) => circuit.phase), ['L1', 'L2', 'L3']);
    assert.deepEqual(plan.circuits.map((circuit) => circuit.assignedCabinets), [
      ['0-0', '1-0'],
      ['2-0', '0-1'],
      ['1-1']
    ]);
  });
});
