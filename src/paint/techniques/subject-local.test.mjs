import test from 'node:test';
import assert from 'node:assert/strict';
import { mixFor, localSubjectWash } from './subject-local.mjs';

const PIGS = [{ K: [0.55, 0.1, 0.05] }, { K: [0.05, 0.3, 0.55] }];

test('the local mix makes the region\'s density from the palette', () => {
  const m = mixFor([0.2, 0.1, 0.1], PIGS);
  const d = [0, 1, 2].map(c => m.reduce((a, v, j) => a + v * PIGS[j].K[c] / 0.55, 0));
  assert.ok(m.every(v => v >= 0));
  assert.ok(Math.abs(d[0] - 0.2) < 0.03);
});

test('the local wash goes before the subject, and the subject\'s pieces are charged for the rest', () => {
  const w = 4, h = 2, n = 8;
  const label = Int32Array.from([1, 1, 1, 1, 0, 0, 0, 0]);
  const st = Buffer.alloc(n * 3, 250); for (let i = 0; i < 4; i++) { st[3 * i] = 120; st[3 * i + 1] = 200; st[3 * i + 2] = 210; }
  const piece = { mix: [0.5, 0], amount: 0.5, area: 4 };
  const layers = [{ _order: { phase: 'ground', region: 0 }, shapes: [] }, { _order: { phase: 'subject', region: 0 }, shapes: [piece] }, { _order: { phase: 'mid', region: 0 }, shapes: [] }];
  const r = localSubjectWash(layers, { regions: { label, areas: [4], subjArea: 4 }, st, PIGS, w, h });
  assert.equal(r.layers.length, 4);
  assert.equal(r.layers[1]._order.local, true);
  const sh = r.layers[1].shapes[0];
  assert.ok(sh.mix[0] > 0 && sh._wow && sh._opening === 1);
  assert.ok(Math.abs(piece._tint - (1 - Math.min(0.5, sh.mix[0]) / 0.5)) < 1e-9);
});
