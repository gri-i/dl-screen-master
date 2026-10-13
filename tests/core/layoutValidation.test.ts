import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { validateWiring } from '../../src/shared/layoutValidation';
import type { Processor } from '../../src/shared/types';

const processor = (ports: Processor['ports']): Processor => ({
  id: 'synthetic-processor',
  brand: 'Synthetic',
  model: 'Test processor',
  ports
});

describe('layout validation', () => {
  it('accepts a complete adjacent wiring path', () => {
    assert.deepEqual(validateWiring(
      { cols: 2, rows: 2, emptyCabinetKeys: [] },
      processor([{ portId: 'P1', maxPixels: 650000, assignedCabinets: ['0-0', '1-0', '1-1', '0-1'] }])
    ), []);
  });

  it('reports unassigned, duplicate, missing, and jumped cabinets', () => {
    const issues = validateWiring(
      { cols: 3, rows: 1, emptyCabinetKeys: [] },
      processor([
        { portId: 'P1', maxPixels: 650000, assignedCabinets: ['0-0', '2-0'] },
        { portId: 'P2', maxPixels: 650000, assignedCabinets: ['0-0', '3-0'] }
      ])
    );

    const expected = [
      { kind: 'unassigned', count: 1, first: '1-0' },
      { kind: 'jump', port: 'P1', from: '0-0', to: '2-0' },
      { kind: 'duplicate', key: '0-0', ports: ['P1', 'P2'] },
      { kind: 'missing', key: '3-0', port: 'P2' }
    ];
    assert.ok(expected.every((expectedIssue) => issues.some((issue) => {
      try {
        assert.deepEqual(issue, expectedIssue);
        return true;
      } catch {
        return false;
      }
    })));
  });
});
