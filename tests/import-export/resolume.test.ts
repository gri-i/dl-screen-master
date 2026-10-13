import { describe, expect, it } from 'vitest';
import { buildResolumeXml } from '../../src/renderer/resolumeExport';
import { syntheticScreen } from './fixtures';

describe('Resolume export', () => {
  it('builds a synthetic Advanced Output XML with one slice per assigned port', () => {
    const result = buildResolumeXml('Project & <fixture>', [syntheticScreen()]);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      screens: 1,
      slices: 2,
      compositionWidth: 256,
      compositionHeight: 256,
      rotatedScreens: []
    });
    expect(result?.xml).toContain('name="Project &amp; &lt;fixture&gt;"');
    expect(result?.xml).toContain('<Screen name="Synthetic screen"');
    expect(result?.xml).toContain('Synthetic screen Sending card 1 1');
    expect(result?.xml).toContain('Synthetic screen Sending card 2 2');
  });

  it('records rotated screens for manual verification in Resolume', () => {
    const result = buildResolumeXml('Rotated fixture', [syntheticScreen({ rotation: 90 })]);

    expect(result?.rotatedScreens).toEqual(['Synthetic screen']);
  });

  it('returns no export for a screen without assigned ports', () => {
    const screen = syntheticScreen({
      processor: {
        ...syntheticScreen().processor!,
        ports: syntheticScreen().processor!.ports.map((port) => ({ ...port, assignedCabinets: [] }))
      }
    });

    expect(buildResolumeXml('Empty fixture', [screen])).toBeNull();
  });
});
