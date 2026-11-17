import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GRID, parseMasksLink } from '../../src/renderer/masksLink';

test('ссылка из узла стены: кабинет, сетка, имя', () => {
  const link = parseMasksLink('?wall=w1&doc=d1&preset=absen-nt-1.9&model=LED%20NT%201.9&cols=8&rows=4&name=%D0%AD%D0%BA%D1%80%D0%B0%D0%BD');
  assert.ok(link);
  assert.equal(link.wall, 'w1');
  assert.equal(link.doc, 'd1');
  assert.equal(link.preset, 'absen-nt-1.9');
  assert.equal(link.model, 'LED NT 1.9');
  assert.equal(link.cols, 8);
  assert.equal(link.rows, 4);
  assert.equal(link.name, 'Экран');
});

test('ссылка: без стены/кабинета/сетки — обычный запуск', () => {
  assert.equal(parseMasksLink(''), null);
  assert.equal(parseMasksLink('?preset=p&cols=4&rows=2'), null);
  assert.equal(parseMasksLink('?wall=w1&cols=4&rows=2'), null);
  assert.equal(parseMasksLink('?wall=w1&preset=p&rows=2'), null);
  assert.equal(parseMasksLink('?wall=w1&preset=p&cols=0&rows=2'), null);
  assert.equal(parseMasksLink(`?wall=w1&preset=p&cols=${MAX_GRID + 1}&rows=2`), null);
});

test('ссылка: модель без id кабинета принимается', () => {
  const link = parseMasksLink('?wall=w2&model=LED%20PL%202.5&cols=3&rows=3');
  assert.ok(link);
  assert.equal(link.preset, null);
  assert.equal(link.model, 'LED PL 2.5');
});
