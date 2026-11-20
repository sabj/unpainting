import test from 'node:test';
import assert from 'node:assert/strict';
import { BENCH_STROKES, layBenchStroke, strokeSize, WASH, INK_AT, GRAPHITE_AT } from './stroke-bench.mjs';
import { layersOf } from './sheet.mjs';

const wash = { K: [0.7, 0.98, 1.32], S: [0.06, 0.025, 0.014], rho: 0.05, omega: 1.4, gamma: 0.15 };
const byId = id => BENCH_STROKES.find(s => s.id === id);
// share of the cells under the stroke's band that hold this channel's pigment, and its total
function marks(sheet, k) {
  let cells = 0, mass = 0;
  for (let i = 0; i < sheet.n; i++) { let m = 0; for (const L of layersOf(sheet)) m += L[k][i]; if (m > 1e-3) cells++; mass += m; }
  return { share: cells / sheet.n, mass };
}

test('every bench stroke has its labels and a sheet in millimetres', () => {
  assert.equal(BENCH_STROKES.length, 13);
  for (const s of BENCH_STROKES) {
    for (const key of ['title', 'tool', 'load', 'pressure', 'speed', 'paper']) assert.ok(s[key] !== undefined, `${s.id} ${key}`);
    const a = strokeSize(s, 0.25), b = strokeSize(s, 0.05);
    assert.equal(b.w, a.w * 5); assert.equal(b.h, a.h * 5);
  }
});

test('a half-empty brush covers the band; a nearly dry one breaks on the tooth', { timeout: 120000 }, async () => {
  const half = (await layBenchStroke(byId('flat-half'), { mmPerCell: 0.25, wash })).sheet;
  const dryFast = (await layBenchStroke(byId('dry-fast'), { mmPerCell: 0.25, wash })).sheet;
  const h = marks(half, WASH), d = marks(dryFast, WASH);
  assert.ok(h.share > 0.25, `half-empty covers ${h.share}`);
  assert.ok(d.share > 0.01 && d.share < h.share / 2, `dry brush covers ${d.share} against ${h.share}`);
});

test('the pen lays ink and the pencil lays graphite, nothing else', { timeout: 60000 }, async () => {
  const pen = (await layBenchStroke(byId('pen'), { mmPerCell: 0.25, wash })).sheet;
  const pencil = (await layBenchStroke(byId('pencil'), { mmPerCell: 0.25, wash })).sheet;
  assert.ok(marks(pen, INK_AT).mass > 0); assert.equal(marks(pen, WASH).mass, 0); assert.equal(marks(pen, GRAPHITE_AT).mass, 0);
  assert.ok(marks(pencil, GRAPHITE_AT).mass > 0); assert.equal(marks(pencil, INK_AT).mass, 0);
});
