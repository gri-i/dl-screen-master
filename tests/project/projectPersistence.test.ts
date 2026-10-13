import { describe, expect, it } from 'vitest';
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
    expect(result.presets.map((item) => item.id)).toEqual(['global', 'new']);
    expect(result.conflicts).toHaveLength(1);
  });

  it('stores only session presets referenced by screens', () => {
    expect(sessionPresetsForProject(screens, [], [preset('session'), preset('unused')]).map((item) => item.id)).toEqual(['session']);
    expect(sessionPresetsForProject(screens, [preset('session')], [preset('session')])).toEqual([]);
  });

  it('does not destroy state on cancel, save cancellation, or recovery cleanup error', async () => {
    let saves = 0;
    expect(await finishDestructiveTransition('cancel', async () => { saves++; return true; }, async () => undefined)).toBe(false);
    expect(saves).toBe(0);
    expect(await finishDestructiveTransition('save', async () => false, async () => undefined)).toBe(false);
    await expect(finishDestructiveTransition('discard', async () => true, async () => { throw new Error('io'); })).rejects.toThrow('io');
  });
});
