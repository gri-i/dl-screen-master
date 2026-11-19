import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { buildResolumeXml } from '../../src/renderer/resolumeExport';
import { syntheticScreen } from './fixtures';

describe('Resolume export', () => {
  it('builds a synthetic Advanced Output XML with one slice per assigned port', () => {
    const result = buildResolumeXml('Project & <fixture>', [syntheticScreen()]);

    assert.notEqual(result, null);
    if (result === null) throw new Error('Expected a Resolume export result');
    assert.deepEqual({
      screens: result.screens,
      slices: result.slices,
      compositionWidth: result.compositionWidth,
      compositionHeight: result.compositionHeight,
      rotatedScreens: result.rotatedScreens
    }, {
      screens: 1,
      slices: 2,
      compositionWidth: 256,
      compositionHeight: 256,
      rotatedScreens: []
    });
    assert.ok(result.xml.includes('name="Project &amp; &lt;fixture&gt;"'));
    assert.ok(result.xml.includes('<Screen name="Synthetic screen"'));
    assert.ok(result.xml.includes('Synthetic screen Sending card 1 1'));
    assert.ok(result.xml.includes('Synthetic screen Sending card 2 2'));
  });

  it('records rotated screens for manual verification in Resolume', () => {
    const result = buildResolumeXml('Rotated fixture', [syntheticScreen({ rotation: 90 })]);

    if (result === null) throw new Error('Expected a rotated Resolume export result');
    assert.deepEqual(result?.rotatedScreens, ['Synthetic screen']);
  });

  it('keeps the composition in mask pixels and the output in physical pixels', () => {
    const screen = syntheticScreen({
      preset: {
        ...syntheticScreen().preset,
        widthMm: 1000, heightMm: 500, resolutionX: 256, resolutionY: 64,
        maskResolutionX: 256, maskResolutionY: 128
      },
      cols: 2, rows: 2, width: 512, height: 256
    });
    const result = buildResolumeXml('Mask fixture', [screen]);

    if (result === null) throw new Error('Expected a Resolume export result');
    assert.equal(result.compositionWidth, 512);
    assert.equal(result.compositionHeight, 256);
    assert.ok(result.xml.includes('<CurrentCompositionTextureSize width="512" height="256"/>'));
    // 2 × 2 кабинета: маска 512 × 256, физический растр 512 × 128.
    assert.ok(result.xml.includes('width="512" height="128"'));
  });

  it('returns no export for a screen without assigned ports', () => {
    const screen = syntheticScreen({
      processor: {
        ...syntheticScreen().processor!,
        ports: syntheticScreen().processor!.ports.map((port) => ({ ...port, assignedCabinets: [] }))
      }
    });

    assert.equal(buildResolumeXml('Empty fixture', [screen]), null);
  });
});
