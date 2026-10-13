import { describe, expect, it } from 'vitest';
import { circuitLoad, routeColor, routeHue, usablePowerPerPortW } from '../../src/shared/powerLimits';

describe('power limits', () => {
  it('applies breaker, safety margin, power factor, and the 3 kW port cap', () => {
    expect(usablePowerPerPortW(230, 16, 20, 0.95)).toBeCloseTo(2796.8);
    expect(usablePowerPerPortW(400, 32, 0, 1)).toBe(3000);
    expect(usablePowerPerPortW(230, 16, 120, 0.95)).toBe(0);
  });

  it('classifies circuit load at the documented boundaries', () => {
    expect(circuitLoad(5, 100, 1000)).toEqual({ watts: 500, ratio: 0.5, percent: 50, status: 'ok' });
    expect(circuitLoad(91, 10, 1000).status).toBe('tight');
    expect(circuitLoad(101, 10, 1000).status).toBe('over');
  });

  it('starts route colors at blue so overload red remains distinct', () => {
    expect(routeHue(0)).toBe(200);
    expect(routeColor(0)).toBe('hsl(200 78% 55%)');
    expect(routeHue(1)).toBe(283);
  });
});
