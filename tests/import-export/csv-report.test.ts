import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  buildCabinetScheduleCsv,
  buildCsvFiles,
  buildReportHtml
} from '../../src/renderer/projectExport';
import { syntheticScreen } from './fixtures';

describe('CSV and report exports', () => {
  it('keeps sending-card data and cabinet order in the cabinet schedule', () => {
    const csv = buildCabinetScheduleCsv([syntheticScreen()], 'en');

    assert.ok(csv.includes('"Screen";"Controller";"Sending card";"Port";"Order in chain"'));
    assert.ok(csv.includes('"Synthetic screen";"Sending card 1";"1";"1";"1";"0-0"'));
    assert.ok(csv.includes('"Synthetic screen";"Sending card 2";"2";"2";"1";"0-1"'));
    assert.ok(csv.indexOf('"0-0"') < csv.indexOf('"1-0"'));
    assert.ok(csv.indexOf('"0-1"') < csv.indexOf('"1-1"'));
  });

  it('exports the expected CSV set and preserves power/data path rows', () => {
    const files = buildCsvFiles([syntheticScreen()], 'en');

    assert.deepEqual(Object.keys(files), ['screens.csv', 'pick-list.csv', 'power.csv', 'data-path.csv']);
    assert.ok(files['screens.csv'].includes('"Synthetic screen";"Synthetic Test 128";"2";"2";"4"'));
    assert.ok(files['power.csv'].includes('"Synthetic circuit 1"'));
    assert.ok(files['data-path.csv'].includes('"Synthetic screen";"NovaStar Sending card 1";"1";"1";"0-0"'));
  });

  it('renders signal path and power path for only the selected screen', () => {
    const html = buildReportHtml('Synthetic project', [syntheticScreen({ name: 'Selected screen' })], 'en');

    assert.ok(html.includes('Selected screen · signal path'));
    assert.ok(html.includes('Selected screen · power path'));
    assert.ok(html.includes('Sending card 1'));
    assert.ok(html.includes('Sending card 2'));
    assert.ok(html.includes('1: 0-0'));
    assert.ok(html.includes('2: 1-1'));
    assert.ok(!html.includes('Other screen'));
  });
});
