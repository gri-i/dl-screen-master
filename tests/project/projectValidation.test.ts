import { describe, expect, it } from 'vitest';
import { buildProjectSnapshot } from '../../src/shared/projectPersistence';
import { parseProject, validateProject } from '../../src/shared/projectValidation';
import type { CabinetPreset, ScreenInstance } from '../../src/shared/types';

const preset: CabinetPreset = {
  id: 'cabinet-a', brand: 'Test', model: 'A', widthMm: 500, heightMm: 500,
  pixelPitchMm: 2.9, resolutionX: 172, resolutionY: 172, weightKg: 8,
  maxPowerW: 300, avgPowerW: 120
};

const screen: ScreenInstance = {
  id: 'screen-1', name: 'Main', presetId: preset.id, cols: 2, rows: 1,
  emptyCabinetKeys: [], position: { x: 0, y: 0 }, rotation: 0,
  visualSettings: {
    showCabinetGrid: true, showCabinetNumbers: false, showTestGrid: false,
    config: { type: 'checkerboard', cellSizePx: 32, colorA: '#ffffff', colorB: '#30343b' },
    screenLabel: 'Main', labelFontSize: 54, textColor: '#ffffff', showResolution: false,
    resolutionTextColor: '#ffffff', logoSource: null, logoPosition: 'top-right',
    logoScalePercent: 20, logoOpacityPercent: 50
  }
};

describe('project validation', () => {
  it('rejects malformed nested values without throwing', () => {
    const result = validateProject({
      format: 'dl-screen-master-project', version: 1, name: 'bad', screens: [{
        id: 'x', name: 'X', presetId: 'missing', cols: 1, rows: 1,
        emptyCabinetKeys: ['2-0'], position: { x: Number.NaN, y: 0 }, rotation: 45,
        processor: { id: 'p', brand: 'b', model: 'm', ports: [{ portId: '1', maxPixels: 1, assignedCabinets: ['0-0', '0-0'] }] }
      }], customPresets: []
    }, { lang: 'en' });

    expect(result.project).toBeUndefined();
    expect(result.errors.join(' ')).toMatch(/missing preset|invalid value|invalid coordinate|finite|more than once/i);
  });

  it('accepts legacy v1 files with optional fields absent and normalizes them', () => {
    const legacy = {
      format: 'dl-screen-master-project', version: 1, name: 'Legacy',
      screens: [{ ...screen, visualSettings: undefined, processor: undefined, powerPlan: undefined }],
      customPresets: [preset]
    };
    const normalized = parseProject(legacy);
    expect(normalized.signal).toBeUndefined();
    expect(normalized.screens[0].visualSettings.logoOpacityPercent).toBe(50);
    expect(normalized.screens[0].visualSettings.showCabinetNumbers).toBe(false);
  });

  it('round-trips project-local session presets and routes', () => {
    const localPreset = { ...preset, id: 'local-b', model: 'B' };
    const project = buildProjectSnapshot({
      name: 'Round trip', createdAt: '2026-10-13T00:00:00.000Z', screens: [{ ...screen, presetId: localPreset.id }],
      customPresets: [], sessionPresets: [localPreset], signal: { bitDepth: 8, frameRateHz: 60 }
    });
    const parsed = parseProject(JSON.parse(JSON.stringify(project)));
    expect(parsed.screens[0].presetId).toBe(localPreset.id);
    expect(parsed.sessionPresets).toEqual([localPreset]);
  });
});
