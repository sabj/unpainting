import test from 'node:test';
import assert from 'node:assert/strict';
import { planStages, deviateLine, polyLength, resampleLine, stageDoc, takeLength } from './drawing-stages.mjs';

const image = { w: 400, h: 300 };
// 30 lines: 10 long structural horizontals, 10 medium openings, 10 short ornaments
const set = [
  ...Array.from({ length: 10 }, (_, i) => ({ role: 'structure', weight: 0.95, strength: 0.6, points: [[20, 20 + 25 * i], [380, 20 + 25 * i]] })),
  ...Array.from({ length: 10 }, (_, i) => ({ role: 'opening', weight: 0.72, strength: 0.5, points: [[40 + 30 * i, 40], [40 + 30 * i, 120]] })),
  ...Array.from({ length: 10 }, (_, i) => ({ role: 'ornament', weight: 0.46, strength: 0.4, widths: [1, 1, 1], weights: [0.4, 0.5, 0.4], points: [[50 + 30 * i, 200], [55 + 30 * i, 206], [60 + 30 * i, 200]] })),
];
// density: dark in the lower half
const dw = 100, dh = 75, D = Float32Array.from({ length: dw * dh }, (_, i) => ((i / dw) | 0) > dh / 2 ? 1 : 0.05);

test('a stage left out is not drawn, and the default pair is prepInk plus finishInk', () => {
  const r = planStages(set, { image, stages: { prepInk: {}, finishInk: {} } });
  assert.equal(r.prep, null);
  assert(r.prepInk.length > 0 && r.finishInk.length > 0);
  assert.equal(r.summary.prepInk.from, 'lines');
  assert.equal(r.summary.finishInk.from, 'prepInk');
});

test('prep takes structure first and ranks it into big shapes, features and detail', () => {
  const r = planStages(set, { image, stages: { prep: { amount: 0.5 } } });
  assert(r.prep.length > 0 && r.prep.length < set.length);
  assert(r.prep.filter(g => g.role === 'structure').length >= r.prep.filter(g => g.role === 'ornament').length);
  assert.deepEqual([...new Set(r.prep.map(g => g.rank))].sort(), [1, 2, 3].slice(0, new Set(r.prep.map(g => g.rank)).size));
  assert.equal(r.prep[0].rank, 1);
});

test('prep ink follows the pencil: keeps a share, drops the rest (left as pencil), adds a few, and deviates slightly', () => {
  const r = planStages(set, { image, stages: { prep: { amount: 0.8 }, prepInk: { keep: 0.7, add: 0.2 } } });
  const s = r.summary.prepInk;
  assert.equal(s.from, 'prep');
  assert.equal(s.kept, Math.round(0.7 * r.prep.length));
  assert.equal(s.dropped, r.prep.length - s.kept);
  assert(s.added >= 1);
  // every kept ink line lies close to its pencil line, but not exactly on it
  const prepByIndex = new Map(r.prep.map(g => [g.index, g]));
  const kept = r.prepInk.filter(g => !g.added);
  let moved = 0;
  for (const g of kept) {
    const p = prepByIndex.get(g.index);
    assert(p, 'an inked line comes from a pencil line');
    const near = g.points.every(([x, y]) => p.points.some(() => true) && distToPoly([x, y], p.points) < 0.0025 * 300 * 1.2 + 0.03 * polyLength(p.points) + 1);
    assert(near, 'the deviation is small');
    if (g.points.some(([x, y]) => distToPoly([x, y], p.points) > 0.05)) moved++;
  }
  assert(moved > kept.length / 2, 'most inked lines deviate from the pencil');
});

test('prepInk from prep without a prep stage is refused with a clear message', () => {
  assert.throws(() => planStages(set, { image, stages: { prepInk: { from: 'prep' } } }), /needs a prep stage/);
});

test('finish ink restates a share of the prep ink, chosen on the darks, as accents', () => {
  const r = planStages(set, { image, density: { D, w: dw, h: dh }, stages: { prepInk: { amount: 1 }, finishInk: { restate: 0.3, select: 'darks' } } });
  assert.equal(r.summary.finishInk.restated, Math.round(0.3 * r.prepInk.length));
  // the darks are the lower half: most restated lines lie there
  const low = r.finishInk.filter(g => g.points.every(([, y]) => y > 140)).length;
  assert(low >= r.finishInk.length * 0.6, `${low} of ${r.finishInk.length} in the darks`);
  const whole = planStages(set, { image, density: { D, w: dw, h: dh }, stages: { prepInk: { amount: 1 }, finishInk: { restate: 0.3, select: 'darks', method: 'architecture' } } });
  assert(whole.finishInk.every(g => g.widths?.length === g.points.length && g.widths.every(v => v >= 1.6 && v <= 4)));
});

test('the same inputs give the same stages', () => {
  const a = planStages(set, { image, density: { D, w: dw, h: dh }, stages: { prep: {}, prepInk: {}, finishInk: {} } });
  const b = planStages(set, { image, density: { D, w: dw, h: dh }, stages: { prep: {}, prepInk: {}, finishInk: {} } });
  assert.deepEqual(a, b);
});

test('deviateLine keeps per-point arrays aligned and the length close', () => {
  const g = { points: [[0, 0], [50, 10], [100, 0]], widths: [1, 2, 1], weights: [0.5, 1, 0.5] };
  const d = deviateLine(g, { scale: 1.5, seed: 3, step: 2 });
  assert.equal(d.widths.length, d.points.length);
  assert.equal(d.weights.length, d.points.length);
  assert(Math.abs(polyLength(d.points) - polyLength(g.points)) < 0.1 * polyLength(g.points));
  assert.deepEqual(deviateLine(g, { scale: 0, seed: 3, step: 2 }), g);
});

test('helpers: resample, length share and the stage document', () => {
  const r = resampleLine({ points: [[0, 0], [10, 0]], widths: [1, 3] }, 1);
  assert.equal(r.points.length, 11);
  assert.equal(r.widths[5], 2);
  assert.equal(takeLength([], 0.5, () => 1).length, 0);
  const doc = stageDoc([{ index: 3, added: true, points: [[0, 0], [1, 1]] }], { image, stage: 'prepInk', source: 'test' });
  assert.equal(doc.lines[0].index, undefined);
  assert.equal(doc.lines[0].added, true);
});

function distToPoly([x, y], P) {
  let best = Infinity;
  for (let k = 1; k < P.length; k++) {
    const [ax, ay] = P[k - 1], [bx, by] = P[k], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  // overshoot past an end counts from the line's extension
  return best;
}

test('pen-only stages preserve the complete prepared drawing and its measured widths', () => {
 const r = planStages(set, { image, stages: { prepInk: {} } });
 assert.equal(r.prepInk.length, set.length);
 for (const g of r.prepInk) {
  assert.deepEqual(g.points, set[g.index].points);
  assert.deepEqual(g.widths, set[g.index].widths);
 }
 assert.equal(r.summary.prepInk.drift, 0);
});

test('zero stage shares lay no marks, including finish restatement', () => {
 const r = planStages(set, { image, stages: { prep: { amount: 0 }, prepInk: { from: 'lines', amount: 0 }, finishInk: { from: 'lines', restate: 0 } } });
 assert.deepEqual([r.prep, r.prepInk, r.finishInk], [[], [], []]);
});

test('deviation cannot overshoot a long structural line by a percentage of its length', () => {
 const g = { points: [[0, 0], [1000, 0]], widths: [1, 1] };
 for (let seed = 0; seed < 30; seed++) {
  const d = deviateLine(g, { scale: .4, step: 2, seed });
  assert(d.points.every(([x,y]) => x >= -.41 && x <= 1000.41 && Math.abs(y) <= .41));
 }
});

test('a closing accent restates each chosen line whole, never its strongest pieces', () => {
  const lines = [{ points: [[0, 10], [50, 10], [100, 10]], length: 100, weight: 1 }, { points: [[0, 40], [100, 40]], length: 100, weight: 1 }];
  // the target is dark only along the right of each line
  const r = planStages(lines, { image: { w: 100, h: 50 }, stages: { prepInk: { from: 'lines' }, finishInk: { restate: 1, deviate: 0 } }, density: { w: 100, h: 50, D: Float32Array.from({ length: 5000 }, (_, i) => (i % 100 > 60 ? 2 : 0)) } });
  assert.equal(r.finishInk.length, 2);
  for (const g of r.finishInk) { const xs = g.points.map(p => p[0]); assert.ok(Math.min(...xs) < 5 && Math.max(...xs) > 95, JSON.stringify(xs)); }
});

const stableContours = () => [
  { id: 'straight', points: [[20, 30], [180, 30]], widths: [1, 2], weights: [.5, .9], weight: .8 },
  { id: 'curve', points: [[20, 80], [60, 55], [100, 50], [140, 55], [180, 80]], width: 1.2, weight: .8 },
  { id: 'corner', points: [[20, 120], [100, 120], [100, 150]], width: .8, weight: .8 },
];
const stableOptions = {
  image: { w: 300, h: 200 },
  stages: { prepInk: { from: 'lines', amount: 1, deviate: .25 }, finishInk: { from: 'prepInk', restate: 1 } },
};
const variation = g => ({ points: g.points, widths: g.widths, weights: g.weights, length: g.length });

test('stage variation follows original contours across unrelated insertion and permutation', () => {
  const lines = stableContours(), before = structuredClone(lines);
  const extra = { id: 'unrelated', points: [[250, 170], [290, 190]], weight: .2 };
  const base = planStages(lines, stableOptions);
  for (const input of [[extra, ...lines], [...lines].reverse(), [lines[1], extra, lines[2], lines[0]]]) {
    const actual = planStages(input, stableOptions);
    for (const stage of ['prepInk', 'finishInk']) for (const expected of base[stage]) {
      assert.deepEqual(variation(actual[stage].find(g => g.id === expected.id)), variation(expected), `${stage}/${expected.id}`);
    }
  }
  assert.deepEqual(lines, before, 'source geometry and contact are read-only');
  assert.deepEqual(planStages(lines, stableOptions), base, 'repeat runs are stable');
  assert.ok(base.prepInk.some(g => JSON.stringify(g.points) !== JSON.stringify(lines.find(s => s.id === g.id).points)), 'retain actual nonzero variation');
});

test('identical and reversed contours have stable variation independent of duplicate ordering', () => {
  const source = stableContours()[0];
  const duplicate = { ...structuredClone(source), id: 'duplicate' };
  const reversed = { ...structuredClone(source), id: 'reversed', points: source.points.toReversed(), widths: source.widths.toReversed(), weights: source.weights.toReversed() };
  const base = planStages([source, duplicate, reversed], stableOptions);
  const permuted = planStages([reversed, duplicate, source], stableOptions);
  for (const stage of ['prepInk', 'finishInk']) {
    for (const expected of base[stage]) assert.deepEqual(variation(permuted[stage].find(g => g.id === expected.id)), variation(expected));
    assert.deepEqual(variation(base[stage].find(g => g.id === source.id)), variation(base[stage].find(g => g.id === duplicate.id)), 'duplicate geometry does not receive a new random offset');
    const forward = base[stage].find(g => g.id === source.id), backward = base[stage].find(g => g.id === reversed.id);
    assert.ok(forward.points[0][0] < forward.points.at(-1)[0]);
    assert.ok(backward.points[0][0] > backward.points.at(-1)[0], 'preserve opposite stroke direction and its existing late-start/overshoot behavior');
  }
});

test('stage variation identity does not depend on pressure or width normalization', () => {
  const lines = stableContours(), changed = lines.map(g => ({ ...g, widths: g.widths?.map(v => v * .9), weights: g.weights?.map(v => v * .8) }));
  const a = planStages(lines, stableOptions), b = planStages(changed, stableOptions);
  for (const stage of ['prepInk', 'finishInk']) for (const expected of a[stage]) {
    assert.deepEqual(b[stage].find(g => g.id === expected.id).points, expected.points, `${stage}/${expected.id}`);
  }
});
