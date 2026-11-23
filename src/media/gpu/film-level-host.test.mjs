import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeLevel, levelBudget, adaptLevel } from './film-level-host.mjs';

const o = { level: 1, meniscusMm: 0.5 }, mm = 0.3;
const names = lv => { const out = []; encodeLevel((name, groups, constants) => out.push([name, constants]), o, mm, lv, 8); return out; };
const status = (levelSteps, missed = 0) => { const v = new Uint32Array(12); v[8] = levelSteps; v[9] = missed; return v; };

test('a CG iteration is two dispatches, closed once by lv_cg_d with the last parity', () => {
  const lv = levelBudget(); lv.iters = 5;
  const run = names(lv).map(([n]) => n);
  assert.equal(run.filter(n => n === 'lv_cg_a').length, 5); assert.equal(run.filter(n => n === 'lv_cg_c').length, 5);
  assert.equal(run.filter(n => n === 'lv_cg_b').length, 0); assert.equal(run.filter(n => n === 'lv_cg_d').length, 1);
  const all = names(lv), a = all.filter(([n]) => n === 'lv_cg_a').map(([, c]) => c);
  assert.deepEqual(a.map(c => [c.LVPAR, c.LVK0 ?? 0]), [[0, 1], [1, 0], [0, 0], [1, 0], [0, 0]]);
  assert.equal(all.find(([n]) => n === 'lv_cg_d')[1].LVPAR, 0);
  assert.equal(a[1], a[3], 'the overrides objects are made once, so the sheet finds the pipeline by the object');
});

test('light only after a read with steps and no level tile, and nothing written since', () => {
  const lv = levelBudget();
  names(lv); adaptLevel(lv, status(0)); assert.equal(lv.light, false, 'not for a caller that does not say when it writes');
  lv.tracksWrites = true; names(lv); adaptLevel(lv, status(0)); assert.equal(lv.light, true);
  assert.deepEqual(names(lv).map(([n]) => n), ['lv_tiles', 'lv_boxes']);
  assert.equal(lv.lightSteps, 1);
  adaptLevel(lv, status(1, 1)); assert.equal(lv.light, false, 'a level tile found on a light step turns it back on');
  assert.equal(lv.total.missed, 1);
  names(lv); adaptLevel(lv, status(0), true); assert.equal(lv.light, false, 'a write since the steps were encoded');
  adaptLevel(lv, status(0)); assert.equal(lv.light, false, 'a read with no steps since says nothing');
});
