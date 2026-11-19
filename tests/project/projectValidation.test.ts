import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
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

    assert.equal(result.project, undefined);
    assert.match(result.errors.join(' '), /missing preset|invalid value|invalid coordinate|finite|more than once/i);
  });

  it('accepts legacy v1 files with optional fields absent and normalizes them', () => {
    const legacy = {
      format: 'dl-screen-master-project', version: 1, name: 'Legacy',
      screens: [{ ...screen, visualSettings: undefined, processor: undefined, powerPlan: undefined }],
      customPresets: [preset]
    };
    const normalized = parseProject(legacy);
    assert.equal(normalized.signal, undefined);
    assert.equal(normalized.screens[0].visualSettings.logoOpacityPercent, 50);
    assert.equal(normalized.screens[0].visualSettings.showCabinetNumbers, false);
  });

  it('keeps the content-mask resolution of a preset in the project file', () => {
    const transparent = { ...preset, id: 'transparent', maskResolutionX: 256, maskResolutionY: 128 };
    const project = parseProject({
      format: 'dl-screen-master-project', version: 1, name: 'Mask',
      screens: [{ ...screen, presetId: transparent.id }],
      customPresets: [transparent]
    });
    assert.deepEqual(project.customPresets[0].maskResolutionX, 256);
    assert.deepEqual(project.customPresets[0].maskResolutionY, 128);
  });

  it('keeps power boxes and their circuit links through save/load', () => {
    const powerPlan = {
      voltage: 230, circuitBreakerAmps: 16, safetyMarginPercent: 20, powerFactor: .95, phases: 3 as const,
      circuits: [
        { id: 'c1', name: 'Circuit 1', phase: 'L1' as const, assignedCabinets: ['0-0'], box: 'b1' },
        { id: 'c2', name: 'Circuit 2', phase: 'L2' as const, assignedCabinets: ['1-0'], box: 'b1' },
        { id: 'c3', name: 'Standalone', phase: 'L3' as const, assignedCabinets: [] }
      ],
      boxes: [{ id: 'b1', name: 'Box 1', circuits: ['c1', 'c2', 'stale'], input: 'cee32_5p' }]
    };
    const project = parseProject({
      format: 'dl-screen-master-project', version: 1, name: 'Boxes',
      screens: [{ ...screen, powerPlan }],
      customPresets: [preset]
    });
    assert.deepEqual(project.screens[0].powerPlan?.boxes, [
      { id: 'b1', name: 'Box 1', circuits: ['c1', 'c2'], input: 'cee32_5p' }
    ]);
    assert.deepEqual(project.screens[0].powerPlan?.circuits.map((circuit) => circuit.box), ['b1', 'b1', undefined]);
  });

  it('restores the box link from a legacy box circuit list', () => {
    const project = parseProject({
      format: 'dl-screen-master-project', version: 1, name: 'Legacy boxes',
      screens: [{
        ...screen,
        powerPlan: {
          voltage: 230, circuitBreakerAmps: 16, safetyMarginPercent: 20, powerFactor: .95, phases: 3,
          circuits: [{ id: 'c1', name: 'Circuit 1', phase: 'L1', assignedCabinets: ['0-0'] }],
          boxes: [{ id: 'b1', name: 'Box 1', circuits: ['c1'] }]
        }
      }],
      customPresets: [preset]
    });
    assert.equal(project.screens[0].powerPlan?.circuits[0].box, 'b1');
    assert.deepEqual(project.screens[0].powerPlan?.boxes?.[0].circuits, ['c1']);
  });

  it('round-trips project-local session presets and routes', () => {
    const localPreset = { ...preset, id: 'local-b', model: 'B' };
    const project = buildProjectSnapshot({
      name: 'Round trip', createdAt: '2026-10-13T00:00:00.000Z', screens: [{ ...screen, presetId: localPreset.id }],
      customPresets: [], sessionPresets: [localPreset], signal: { bitDepth: 8, frameRateHz: 60 }
    });
    const parsed = parseProject(JSON.parse(JSON.stringify(project)));
    assert.equal(parsed.screens[0].presetId, localPreset.id);
    assert.deepEqual(parsed.sessionPresets, [localPreset]);
  });
});
