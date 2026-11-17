import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  DEFAULT_SIGNAL,
  GIGABIT_LEGACY_LINK,
  linkCapacityPx,
  portLoad,
  portMaxFrameRate,
  portMaxPixels,
  wireBitsPerPixel
} from '../../src/shared/capacity';
import type { ProcessorPort } from '../../src/shared/types';

describe('signal capacity', () => {
  it('uses the documented container packing rules', () => {
    assert.equal(wireBitsPerPixel(8), 24);
    assert.equal(wireBitsPerPixel(10), 32);
    assert.equal(wireBitsPerPixel(12), 48);
    assert.equal(wireBitsPerPixel(10, 'container-legacy'), 48);
    assert.equal(wireBitsPerPixel(10, 'naive'), 30);
  });

  it('calculates the legacy gigabit link at 650000 pixels for 8-bit 60 Hz', () => {
    assert.equal(linkCapacityPx(GIGABIT_LEGACY_LINK, DEFAULT_SIGNAL), 650000);
    assert.equal(portMaxPixels({ maxPixels: 650000, assignedCabinets: [], portId: 'P1' }), 650000);
    const frameRate = portMaxFrameRate({ maxPixels: 650000, assignedCabinets: [], portId: 'P1' }, 650000, 8);
    if (frameRate === null) throw new Error('Expected a frame-rate limit for the legacy link');
    assert.ok(Math.abs(frameRate - 60) < 0.001);
  });

  it('reports pixel and cabinet-limit overloads', () => {
    const port: ProcessorPort = {
      portId: 'P1',
      maxPixels: 1000,
      maxCabinets: 2,
      assignedCabinets: ['0-0', '1-0', '2-0']
    };

    const load = portLoad(port, 400);
    assert.equal(load.pixels, 1200);
    assert.equal(load.percent, 150);
    assert.equal(load.status, 'over');
    assert.equal(load.maxFrameRateHz, null);
  });
});
