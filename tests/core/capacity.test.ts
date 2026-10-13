import { describe, expect, it } from 'vitest';
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
    expect(wireBitsPerPixel(8)).toBe(24);
    expect(wireBitsPerPixel(10)).toBe(32);
    expect(wireBitsPerPixel(12)).toBe(48);
    expect(wireBitsPerPixel(10, 'container-legacy')).toBe(48);
    expect(wireBitsPerPixel(10, 'naive')).toBe(30);
  });

  it('calculates the legacy gigabit link at 650000 pixels for 8-bit 60 Hz', () => {
    expect(linkCapacityPx(GIGABIT_LEGACY_LINK, DEFAULT_SIGNAL)).toBe(650000);
    expect(portMaxPixels({ maxPixels: 650000, assignedCabinets: [], portId: 'P1' })).toBe(650000);
    expect(portMaxFrameRate({ maxPixels: 650000, assignedCabinets: [], portId: 'P1' }, 650000, 8)).toBeCloseTo(60);
  });

  it('reports pixel and cabinet-limit overloads', () => {
    const port: ProcessorPort = {
      portId: 'P1',
      maxPixels: 1000,
      maxCabinets: 2,
      assignedCabinets: ['0-0', '1-0', '2-0']
    };

    const load = portLoad(port, 400);
    expect(load.pixels).toBe(1200);
    expect(load.percent).toBe(150);
    expect(load.status).toBe('over');
    expect(load.maxFrameRateHz).toBeNull();
  });
});
