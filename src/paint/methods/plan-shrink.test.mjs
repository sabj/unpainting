import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { blocks, shrinkPlan } from './plan-shrink.mjs';
import { planHash, writePlanFile, readPlanFile, readPlanNote, paintKeys, PLAN_FILE } from './plan-file.mjs';
import { passage } from '../../crop/blockin.mjs';

const W = 8, H = 6;
/** A wash over the cells rect [x0, x1] x [y0, y1] of the W x H grid. */
function wash(id, x0, y0, x1, y1, more = {}) {
  const ids = new Uint8Array(W * H); let area = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { ids[y * W + x] = 1; area++; }
  const intent = { id, kind: 'wash', stage: 1, mixId: 0, move: 'wet on dry', phase: 'light', load: { water: 0.6 }, resolution: { mmPerCell: 10 }, edges: { hardCells: [], softCells: [y0 * W + x0], policy: 'mixed' },
    strokes: [{ kind: 'sweep', radiusMm: 5, points: [[x0 * 10, y0 * 10, 0.6], [x1 * 10, y1 * 10, 0.6]] }], outline: [{ points: [[x0 * 10, y0 * 10]], soft: [false] }] };
  return { sh: Object.assign(passage(ids, 1, { x0, y0, x1, y1 }, 0.5, area, W), { mix: [1], graded: null, dryAfter: true, _valuePlan: intent, ...more }), ins: { ...intent, area, plannedPigmentMass: 0.5 * area } };
}
function plan(washes) {
  const labels = new Int32Array(W * H).fill(2); for (let i = 0; i < W; i++) labels[i] = 7;
  return { layers: [{ value: 1, pigment: 0, mixId: 0, shapes: washes.map(q => q.sh), mix: [1], area: washes.reduce((a, q) => a + q.sh.area, 0) }], instructions: washes.map(q => q.ins), mixes: [{ mix: [1], strength: 0.5, stage: 1 }],
    value: { peak: 1, values: Float32Array.from({ length: W * H }, (_, i) => i % 2), bands: new Uint8Array(W * H).fill(3) }, regions: { source: 't', labels, regions: [] }, protectedCells: null, lightShapes: [{ id: 1, cells: 12 }], summary: { washes: washes.length } };
}

test('every final cell falls in one block of a look cell, none empty, at any ratio', () => {
  assert.deepEqual(blocks(8, 4), [[0, 2], [2, 4], [4, 6], [6, 8]]);
  const b = blocks(977, 489); assert.equal(b[0][0], 0); assert.equal(b.at(-1)[1], 977);
  assert.ok(b.every(([a, z], q) => z > a && (q === 0 || a === b[q - 1][1])));
  assert.throws(() => blocks(4, 8), RangeError);
});

test('the look\'s plan is the final\'s, wash for wash: same washes, strokes and hash, a quarter of the cells', () => {
  const big = wash('light/s1/m0/big', 0, 0, 5, 3), full = plan([big, wash('light/s1/m0/second', 4, 2, 7, 5)]);
  const look = shrinkPlan(full, { w: W, h: H }, { w: 4, h: 3, sheetWidthMm: 80 });
  assert.equal(look.instructions.length, 2); assert.deepEqual(look.instructions.map(q => q.id), full.instructions.map(q => q.id));
  assert.equal(planHash(look), planHash(full));
  assert.deepEqual(look.instructions[0].strokes, full.instructions[0].strokes, 'strokes stay in millimetres');
  const sh = look.layers[0].shapes[0];
  // 6 x 4 final cells are 3 x 2 look cells, and the wash's planned paint goes with its area
  assert.equal(sh.area, 6); assert.deepEqual(sh.box, { x0: 0, y0: 0, x1: 2, y1: 1 }); assert.equal(sh.w, 4); assert.equal(sh.ids.length, 12);
  assert.equal(sh.mask.reduce((a, v) => a + v, 0), 6, 'the mask is rebuilt from the look\'s own cells');
  assert.equal(look.instructions[0].area, 6); assert.equal(look.instructions[0].plannedPigmentMass, 3);
  assert.equal(sh._valuePlan.resolution.mmPerCell, 20); assert.equal(sh.dryAfter, true); assert.deepEqual(sh.mix, [1]);
  assert.deepEqual(sh._valuePlan.edges.softCells, [0]);
  assert.equal(look.layers[0].area, 6 + look.layers[0].shapes[1].area);
  assert.equal(look.value.values.length, 12); assert.ok(Math.abs(look.value.values[0] - 0.5) < 1e-6, 'a value is the mean of the cells under it');
  assert.deepEqual([...look.regions.labels.slice(0, 4)], [7, 7, 7, 7], 'a label is the commonest under the cell, the first met on a tie'); assert.equal(look.regions.labels[4], 2);
  assert.equal(look.lightShapes[0].cells, 3);
  // the final's plan is untouched
  assert.equal(full.layers[0].shapes[0].area, 24); assert.equal(full.layers[0].shapes[0].ids.length, W * H);
});

test('a wash too thin for half a look cell keeps the cells it touches: no wash of the final is missing from the look', () => {
  // one final cell wide: a quarter of each look cell it crosses
  const thin = wash('light/s1/m0/thin', 3, 0, 3, 5), look = shrinkPlan(plan([thin]), { w: W, h: H }, { w: 4, h: 3, sheetWidthMm: 80 });
  assert.equal(look.layers[0].shapes[0].area, 3); assert.ok(look.instructions[0].plannedPigmentMass > 0);
});

test('a cell field the look cannot bring down is refused, never left on the final\'s grid', () => {
  const p = plan([wash('a', 0, 0, 3, 3)]); p.extra = { cover: new Float32Array(W * H) };
  assert.throws(() => shrinkPlan(p, { w: W, h: H }, { w: 4, h: 3, sheetWidthMm: 80 }), /cell field this look cannot bring down \(cover\)/);
  const q = plan([wash('a', 0, 0, 3, 3)]); q.instructions.push({ ...q.instructions[0], id: 'orphan' });
  assert.throws(() => shrinkPlan(q, { w: W, h: H }, { w: 4, h: 3, sheetWidthMm: 80 }), /orphan is in the plan's list but in none of its layers/);
});

test('a plan is kept as a file with its note and read back whole; a file that is not that plan is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-file-'));
  try {
    const full = plan([wash('light/s1/m0/big', 0, 0, 5, 3)]), pigments = [{ key: 'ochre', name: 'yellow ochre' }];
    const note = writePlanFile(dir, { plan: full, w: W, h: H, sheetWidthMm: 80, pigments });
    assert.deepEqual([note.w, note.h, note.washes, note.paints, note.pigments, note.hash], [W, H, 1, ['ochre'], ['yellow ochre'], planHash(full)]);
    assert.deepEqual(readPlanNote(dir), note);
    const back = readPlanFile(path.join(dir, PLAN_FILE));
    assert.equal(planHash(back.plan), note.hash); assert.equal(back.plan.layers[0].shapes[0].mask.reduce((a, v) => a + v, 0), 24, 'a wash comes back as a wash, its mask its own');
    assert.equal(shrinkPlan(back.plan, { w: W, h: H }, { w: 4, h: 3, sheetWidthMm: 80 }).layers[0].shapes[0].area, 6);
    assert.equal(paintKeys([{ name: 'a fitted pigment' }]), null);
    assert.throws(() => readPlanFile(path.join(dir, 'none.bin')), /is not there/);
    assert.equal(readPlanNote(os.tmpdir()), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
