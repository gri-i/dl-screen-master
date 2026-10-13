import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { finishDestructiveTransition, mergePresetsPreservingExisting, sessionPresetsForProject } from '../../src/shared/projectPersistence';
import type { CabinetPreset, ScreenInstance } from '../../src/shared/types';

const preset = (id: string, model = id): CabinetPreset => ({
  id, brand: 'Test', model, widthMm: 500, heightMm: 500, pixelPitchMm: 2.9,
  resolutionX: 172, resolutionY: 172, weightKg: 8, maxPowerW: 300, avgPowerW: 120
});
const screens = [{ id: 's', name: 'S', presetId: 'session', cols: 1, rows: 1, emptyCabinetKeys: [], position: { x: 0, y: 0 }, rotation: 0,
  visualSettings: { showCabinetGrid: true, showCabinetNumbers: false, showTestGrid: false, config: { type: 'checkerboard', cellSizePx: 32, colorA: '#ffffff', colorB: '#000000' }, screenLabel: 'S', labelFontSize: 54, textColor: '#ffffff', showResolution: false, resolutionTextColor: '#ffffff', logoSource: null, logoPosition: 'top-right', logoScalePercent: 20, logoOpacityPercent: 50 } }] satisfies ScreenInstance[];

describe('project persistence', () => {
  it('keeps global presets and reports non-identical conflicts', () => {
    const existing = preset('global');
    const result = mergePresetsPreservingExisting([existing], [preset('new'), { ...existing, maxPowerW: 999 }]);
    assert.deepEqual(result.presets.map((item) => item.id), ['global', 'new']);
    assert.equal(result.conflicts.length, 1);
  });

  it('stores only session presets referenced by screens', () => {
    assert.deepEqual(sessionPresetsForProject(screens, [], [preset('session'), preset('unused')]).map((item) => item.id), ['session']);
    assert.deepEqual(sessionPresetsForProject(screens, [preset('session')], [preset('session')]), []);
  });

  it('does not destroy state on cancel, save cancellation, or recovery cleanup error', async () => {
    let saves = 0;
    assert.equal(await finishDestructiveTransition('cancel', async () => { saves++; return true; }, async () => undefined), false);
    assert.equal(saves, 0);
    assert.equal(await finishDestructiveTransition('save', async () => false, async () => undefined), false);
    await assert.rejects(finishDestructiveTransition('discard', async () => true, async () => { throw new Error('io'); }), /io/);
  });
});
