// Each technique is recognised from the evidence it leaves, painted by hand into a buffer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseTechnique, softEdgeShare, toothShowing, detailMarks } from './technique.mjs';

const W = 140, H = 120, N = W * H;
const blank = () => new Float32Array(N);
const discMask = (cx, cy, r) => { const m = new Uint8Array(N); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) m[y * W + x] = 1; return m; };

/** A passage that stops dead at its edge. */
const hardDisc = (v, cx = 70, cy = 60, r = 34) => {
  const D = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) D[y * W + x] = v;
  return D;
};
/** One that fades over many cells and runs past the intended shape; fading inside it would leave a hard edge. */
const softDisc = (v, cx = 70, cy = 60, r = 34, fade = 12) => {
  const D = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cy);
    D[y * W + x] = v * Math.max(0, Math.min(1, (r + fade - d) / (2 * fade)));
  }
  return D;
};
/** One dragged with a brush too dry to fill the tooth: paint on the hills, paper in the pits. */
const dragged = (v, cx = 70, cy = 60, r = 34) => {
  const D = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 >= r * r) continue;
    const skip = (Math.sin(x * 1.7) * Math.sin(y * 1.3)) > 0.1;
    D[y * W + x] = skip ? 0 : v;
  }
  return D;
};

test('a passage that stops dead is wet on dry', () => {
  const t = chooseTechnique(hardDisc(0.3), discMask(70, 60, 34), W, H, { peak: 1 });
  assert.equal(t.name, 'wet on dry', `edge ${t.edge.toFixed(2)} tooth ${t.tooth.toFixed(2)} depth ${t.depth.toFixed(2)}`);
  assert.equal(t.intoWet, false);
  assert.equal(t.dryAfter, true);
});

test('a passage with no edge anywhere is wet on wet, and goes into standing water', () => {
  const t = chooseTechnique(softDisc(0.3), discMask(70, 60, 34), W, H, { peak: 1 });
  assert.equal(t.name, 'wet on wet', `edge ${t.edge.toFixed(2)}`);
  assert.equal(t.intoWet, true);
  // loaded, not full: a full load floods the tooth and levels flat
  assert.ok(t.water > 0.8, `and the brush is the wettest of the four: ${t.water}`);
  assert.equal(t.wetMix > 0.6, true, 'and it mixes with what is already standing');
});

test('a passage with the tooth showing through in pieces is dragged', () => {
  const t = chooseTechnique(dragged(0.4), discMask(70, 60, 34), W, H, { peak: 1 });
  assert.equal(t.name, 'dry brush', `tooth ${t.tooth.toFixed(2)} in ${JSON.stringify(toothShowing(dragged(0.4), discMask(70, 60, 34), W, H))}`);
  assert.ok(t.water < 0.4, 'and the brush is nearly dry');
  assert.ok(t.bridge < 0.6, 'and it rides the tooth rather than filling it');
});

test('a deep passage with a hard edge is built up over dry paint', () => {
  const t = chooseTechnique(hardDisc(0.9), discMask(70, 60, 34), W, H, { peak: 1 });
  assert.equal(t.name, 'glazed', `depth ${t.depth.toFixed(2)}`);
  assert.ok(t.passes > 1, 'in more than one pass');
  assert.equal(t.dryAfter, true);
});

test('the edge measure separates the two kinds of edge', () => {
  const mask = discMask(70, 60, 34);
  const hard = softEdgeShare(hardDisc(0.3), mask, W, H);
  const soft = softEdgeShare(softDisc(0.3), mask, W, H);
  assert.ok(soft > hard + 0.3, `soft ${soft.toFixed(2)} against hard ${hard.toFixed(2)}`);
});

test('the tooth measure counts pieces, not just bare area', () => {
  const mask = discMask(70, 60, 34);
  const drag = toothShowing(dragged(0.4), mask, W, H);
  // one big unpainted bite has as much bare paper but is not dragging
  const bite = blank();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x] && x > 70) bite[y * W + x] = 0.4;
  const one = toothShowing(bite, mask, W, H);
  assert.ok(drag.pieces > 4 * one.pieces, `dragged ${drag.pieces.toFixed(0)} pieces against ${one.pieces.toFixed(0)} for one bite`);
});


test('detail marks leave paper between them rather than covering the passage', () => {
  const want = blank();
  for (let y = 40; y < 80; y++) for (let x = 40; x < 100; x++) want[y * W + x] = 0.3;
  const marks = detailMarks(want, W, H, { length: 9, spacing: 4 });
  assert.ok(marks.length > 4, `it makes marks: ${marks.length}`);
  const covered = new Uint8Array(N);
  for (const m of marks) for (const p of m) covered[Math.round(p.y) * W + Math.round(p.x)] = 1;
  let on = 0, area = 0;
  for (let y = 40; y < 80; y++) for (let x = 40; x < 100; x++) { area++; on += covered[y * W + x]; }
  assert.ok(on / area < 0.35, `and leaves the paper showing: ${(100 * on / area).toFixed(0)}% covered`);
});

test('detail marks follow the direction the passage runs', () => {
  // a passage striped horizontally: marks should run along the stripes, not across them
  const want = blank();
  for (let y = 30; y < 90; y++) for (let x = 20; x < 120; x++) want[y * W + x] = 0.2 + 0.15 * (Math.floor(y / 5) % 2);
  const marks = detailMarks(want, W, H, { length: 11, spacing: 3 });
  let along = 0, across = 0;
  for (const m of marks) {
    const a = m[0], b = m[m.length - 1];
    Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? along++ : across++;
  }
  assert.ok(along > across * 2, `${along} marks along the stripes against ${across} across them`);
});

test('detail marks go where the passage wants paint, not evenly', () => {
  const want = blank();
  for (let y = 30; y < 90; y++) for (let x = 20; x < 120; x++) want[y * W + x] = x > 70 ? 0.4 : 0.03;
  const marks = detailMarks(want, W, H, { length: 9, spacing: 4, minWant: 0.05 });
  let right = 0, left = 0;
  for (const m of marks) (m[0].x > 70 ? right++ : left++);
  assert.ok(right > 0 && left === 0, `${right} marks in the passage that wants paint, ${left} in the one that does not`);
});
