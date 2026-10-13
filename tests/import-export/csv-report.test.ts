import { describe, expect, it } from 'vitest';
import {
  buildCabinetScheduleCsv,
  buildCsvFiles,
  buildReportHtml
} from '../../src/renderer/projectExport';
import { syntheticScreen } from './fixtures';

describe('CSV and report exports', () => {
  it('keeps sending-card data and cabinet order in the cabinet schedule', () => {
    const csv = buildCabinetScheduleCsv([syntheticScreen()], 'en');

    expect(csv).toContain('"Screen";"Controller";"Sending card";"Port";"Order in chain"');
    expect(csv).toContain('"Synthetic screen";"Sending card 1";"1";"1";"1";"0-0"');
    expect(csv).toContain('"Synthetic screen";"Sending card 2";"2";"2";"1";"0-1"');
    expect(csv.indexOf('"0-0"')).toBeLessThan(csv.indexOf('"1-0"'));
    expect(csv.indexOf('"0-1"')).toBeLessThan(csv.indexOf('"1-1"'));
  });

  it('exports the expected CSV set and preserves power/data path rows', () => {
    const files = buildCsvFiles([syntheticScreen()], 'en');

    expect(Object.keys(files)).toEqual(['screens.csv', 'pick-list.csv', 'power.csv', 'data-path.csv']);
    expect(files['screens.csv']).toContain('"Synthetic screen";"Synthetic Test 128";"2";"2";"4"');
    expect(files['power.csv']).toContain('"Synthetic circuit 1"');
    expect(files['data-path.csv']).toContain('"Synthetic screen";"NovaStar Sending card 1";"1";"1";"0-0"');
  });

  it('renders signal path and power path for only the selected screen', () => {
    const html = buildReportHtml('Synthetic project', [syntheticScreen({ name: 'Selected screen' })], 'en');

    expect(html).toContain('Selected screen · signal path');
    expect(html).toContain('Selected screen · power path');
    expect(html).toContain('Sending card 1');
    expect(html).toContain('Sending card 2');
    expect(html).toContain('1: 0-0');
    expect(html).toContain('2: 1-1');
    expect(html).not.toContain('Other screen');
  });
});
