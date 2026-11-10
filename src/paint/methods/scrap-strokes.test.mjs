// Scrap tests for strokes (arch-review item 4): two wet strokes of one charge must fuse, and a round brush must leave
// the mark the planner takes it to leave. The pass marks are stated in scrap-join.mjs and scrap-mark.mjs and were
// written before any run. The instruments below are the painter's own wash instruments (tools/paint-plate.mjs: the
// shaped-passage brush, the wash physics, the dry options), on a 540-cell-wide sheet of the benchmark's 280 mm paper so
// the tests stay quick. Nothing here reads a target.
import test from 'node:test';
import assert from 'node:assert/strict';
import { joinRows, scrapJoin } from './scrap-join.mjs';
import { scrapMark, ROUND_END_FILL } from './scrap-mark.mjs';
import { step, dry, DEFAULTS } from '../../media/sheet.mjs';
import { createBrush, dip, stroke, sideReach, edgeHalfWidth } from '../../media/brush.mjs';
import { scaleBrushForDensity } from '../../media/brush-density.mjs';

const W = 540, mm = 280 / W, sc = W / 540;
const physics = { ...DEFAULTS, fixedBed: 1, edgeEvap: 0.0012, gran: 0.25, granFill: 0 };
const paperOptions = { mmPerCell: mm, seed: 9, scale: 1, toothScale: 0.2, fibres: 0.5, tooth: 0.5, proudBlur: 1, coldPress: { mmPerCell: mm, bumpMm: [0.5, 2], cover: 2.2, swell: 0.3 } };
const pigment = { K: [0.25, 0.8, 1.5], S: [0.05, 0.04, 0.03], rho: 0.06, omega: 1, gamma: 0.5 };
const WATER = 0.62, CONC = 0.66;

// kit sizes in mm, as the stroke planner's kit
const kit = (mmWide, { flat, model = 'row', seed = 0 } = {}) => {
  const R = mmWide / 2 / mm;
  return { R, flat, opts: s => scaleBrushForDensity({ grainShift: 0, flat, model, radius: R, bristles: Math.max(12, Math.ceil(R * 2)), capacity: 100, belly: 12, feed: 0.4, give: 0.9, free: 0.4, film: 0.25, splay: 0.03, stiffness: 8, wetMix: 0.3, bridge: 0, bridgeSoft: 2.4, seed: 31 + seed + s }, { renderWidth: W }) };
};
// the planner's footprint half-width at a pressure (flat: the row, round: the belly)
const footprintHalf = (R, flat, p) => (flat ? R * (0.9 + 0.1 * p) * Math.sqrt(Math.min(1, p / 0.5)) : R * (0.25 + 0.75 * p));

function instruments({ R, flat, opts }, p) {
  const big = R * mm >= 4, spacing = (big ? 1.4 : 0.7) * sc;
  return {
    pigment, physics, paperOptions, step, dry,
    brush: (s = 0) => createBrush(opts(s)),
    loaded: b => b.resP[0] + b.hairs.reduce((a, hr) => a + hr.pig[0], 0),
    dipBrush: b => dip(b, { water: WATER, conc: [CONC] }),
    path: (x0, x1, y) => [{ x: x0, y, p, r: R }, { x: x1, y, p, r: R }],
    stroke: (b, s, pts, o) => stroke(b, s, pts, { ...o, upright: flat ? 'sweep' : false, spacing }),
    flowEvery: big ? 12 : 24, settle: 60, dryOptions: { levelMax: 140, dt: 2 },
  };
}

test('the join rows lie between the two bodies and move with the overlap', () => {
  const butt = joinRows({ half: 20, edge: 4, overlap: 0, margin: 30 });
  assert.equal(butt.pitch, 40);
  assert.ok(butt.bodyA[1] < butt.join[0] && butt.join[1] < butt.bodyB[0], JSON.stringify(butt));
  const lap = joinRows({ half: 20, edge: 4, overlap: 0.25, margin: 30 });
  assert.equal(lap.pitch, 30);
  assert.ok(lap.join[1] - lap.join[0] > butt.join[1] - butt.join[0], 'an overlap widens the join');
  assert.throws(() => joinRows({ half: 4, edge: 4, overlap: 0.5, margin: 10 }), /too narrow/);
  assert.throws(() => joinRows({ half: 20, edge: 4, overlap: 1, margin: 10 }), RangeError);
});

test('the round-end limit lies midway between a half-disc and a square', () => {
  assert.ok(Math.abs(ROUND_END_FILL - (1 + Math.PI / 4) / 2) < 1e-12);
});

// Two 1 in flat strokes, butted, lapped by the painter's own lane overlap (one stroke's fringe over the other) and
// lapped by a quarter. The flat is the brush every shaped passage is laid with.
const FLAT = kit(25.4, { flat: true }), P = 0.9;
const half = footprintHalf(FLAT.R, true, P);
const edge = (1 + 0.08 * half) + sideReach(FLAT.opts(0)) * half;
const laneOverlap = 1 - edgeHalfWidth(FLAT.R, { pressure: P, splay: 0.03 }) / half;
const joins = new Map();
const join = overlap => {
  if (!joins.has(overlap)) joins.set(overlap, scrapJoin({ ...instruments(FLAT, P), half, edge, overlap, length: Math.round(6 * FLAT.R) }));
  return joins.get(overlap);
};
const show = r => `body ${r.body.min.toFixed(4)}..${r.body.max.toFixed(4)}, join ${r.join.min.toFixed(4)}..${r.join.max.toFixed(4)}`;

test('two strokes on scrap put on the paper all the pigment that left the brushes', () => {
  for (const ov of [0, laneOverlap, 0.25]) { const r = join(ov); assert.ok(r.given > 0 && r.conserved, `overlap ${ov}: given ${r.given}, on sheet ${r.onSheet}`); }
});

test('two flat strokes lapped by the lane overlap fuse', () => {
  const r = join(laneOverlap); assert.ok(r.fused, show(r));
});
test('two flat strokes lapped by a quarter fuse', { todo: 'the paint smeared off the second brush soaks in over the first: the lap dries up to 6% darker than the body' }, () => {
  const r = join(0.25); assert.ok(r.fused, show(r));
});
test('two butted flat strokes fuse', { todo: 'the ragged fringes leave dry paper between the strokes, which a bead does not cross' }, () => {
  const r = join(0); assert.ok(r.fused, show(r));
});

// A round (12 mm, the stroke planner's largest round) at three pressures, against the planner's footprint, and its
// body against the flat's body from the same dip.
const ROUND = kit(12, { flat: false });
const marks = new Map();
const mark = p => {
  if (!marks.has(p)) marks.set(p, scrapMark({ ...instruments(ROUND, p), half: footprintHalf(ROUND.R, false, p), length: Math.round(Math.max(8 * ROUND.R, 40)) }));
  return marks.get(p);
};
let flatBody = null;
const reference = () => (flatBody ??= scrapMark({ ...instruments(FLAT, P), half, length: Math.round(6 * FLAT.R) }).body);

for (const p of [0.3, 0.6, 0.9]) {
  test(`a round brush leaves a round end at pressure ${p}`, () => {
    const r = mark(p);
    assert.ok(r.startFill <= ROUND_END_FILL && r.endFill <= ROUND_END_FILL, `start ${r.startFill.toFixed(2)}, end ${r.endFill.toFixed(2)}`);
  });
  const halfP = footprintHalf(ROUND.R, false, p), tol = 2 * sideReach(ROUND.opts(0)) * halfP + 1;
  test(`a round brush is as wide as the planner takes it at pressure ${p}`, p < 0.5 ? { todo: 'a light round touch lays a narrower mark than the planner assumes' } : {}, () => {
    const r = mark(p);
    assert.ok(Math.abs(r.width - 2 * halfP) <= tol, `width ${r.width.toFixed(1)} against ${(2 * halfP).toFixed(1)} +- ${tol.toFixed(1)}`);
  });
  test(`a round brush delivers what the flat does from the same dip at pressure ${p}`, p < 0.9 ? { todo: 'a lighter round touch lays a thinner film' } : {}, () => {
    const ratio = mark(p).body / reference();
    assert.ok(ratio >= 0.9 && ratio <= 1.1, `round over flat ${ratio.toFixed(3)}`);
  });
}
