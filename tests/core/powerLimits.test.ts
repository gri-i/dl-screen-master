import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { circuitLoad, routeColor, routeHue, usablePowerPerPortW } from '../../src/shared/powerLimits';

describe('power limits', () => {
  it('applies breaker, safety margin, power factor, and the 3 kW port cap', () => {
    assert.ok(Math.abs(usablePowerPerPortW(230, 16, 20, 0.95) - 2796.8) < 0.001);
    assert.equal(usablePowerPerPortW(400, 32, 0, 1), 3000);
    assert.equal(usablePowerPerPortW(230, 16, 120, 0.95), 0);
  });

  it('classifies circuit load at the documented boundaries', () => {
    assert.deepEqual(circuitLoad(5, 100, 1000), { watts: 500, ratio: 0.5, percent: 50, status: 'ok' });
    assert.equal(circuitLoad(91, 10, 1000).status, 'tight');
    assert.equal(circuitLoad(101, 10, 1000).status, 'over');
  });

  it('starts route colors at blue so overload red remains distinct', () => {
    assert.equal(routeHue(0), 200);
    assert.equal(routeColor(0), 'hsl(200 78% 55%)');
    assert.equal(routeHue(1), 283);
  });
});
