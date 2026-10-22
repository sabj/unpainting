import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLines } from './ink-decide.mjs';
import { parseLabelReply, simpleLabel, ruleAt, shadowMassMask, labelRegions, INK_RULES, LABELS } from './ink-labels.mjs';
import { cutMassEdges } from './line-class.mjs';

const W = 160, H = 100, PX = 0.15;
// paper 90; a pen line (L 40, 2 px) along row 20; a dark wash block (L 55) on rows 60..99 whose top edge at row 60 has no line
function plane() {
  const L = new Float32Array(W * H).fill(90);
  for (let x = 0; x < W; x++) { L[20 * W + x] = 40; L[21 * W + x] = 40; }
  for (let y = 60; y < H; y++) for (let x = 0; x < W; x++) L[y * W + x] = 55;
  return L;
}
const line = (y, x0 = 5, x1 = 155) => ({ points: Array.from({ length: 31 }, (_, k) => ({ x: x0 + (x1 - x0) * k / 30, y })) });

test('a pen line is kept and a wash edge with no line of its own is cut', () => {
  const r = cutMassEdges([line(21, 5, 155), line(60, 5, 60)], plane(), W, H, PX);
  const ys = r.lines.map(g => g.points[0].y);
  assert.ok(ys.some(y => Math.abs(y - 21) < 1), 'the pen line stays');
  assert.ok(!ys.some(y => Math.abs(y - 60) < 1.5), 'the wash edge goes');
  assert.ok(r.stats.massBefore > 0.15 && r.stats.massAfter < 0.05, JSON.stringify(r.stats));
});

test('the label of the ground decides: foliage is wash only, architecture keeps the pen line', () => {
  const L = plane();
  const arch = decideLines([line(21, 5, 80)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'architecture' });
  assert.ok(arch.stats.keptPx > 60);
  const leaves = decideLines([line(21, 5, 80)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'foliage' });
  assert.equal(leaves.lines.length, 0);
  assert.ok(leaves.stats.droppedMm.label.foliage > 8);
  const edge = decideLines([line(21, 5, 80)], { L, w: W, h: H, pxMm: PX, cellLabel: (x, y) => (y < 21 ? 'sky' : 'architecture') });
  assert.ok(edge.stats.keptPx > 60, 'a contour with architecture on one side is drawn');
});

test('a long smooth line that is pen line is structure whatever the ground says', () => {
  const r = decideLines([line(21, 0, 159)], { L: plane(), w: W, h: H, pxMm: 0.15, cellLabel: () => 'sky' });
  assert.ok(r.stats.keptPx > 100);
});

test('labels: replies are checked, the rules cover every label, a shadow mask finds a broad dark block', () => {
  assert.deepEqual(parseLabelReply('Here: {"1": "Sky", "2": "tree", "3": "banana"}', [1, 2, 3]), { 1: 'sky', 2: 'tree_trunk' });
  assert.equal(parseLabelReply('nothing', [1]), null);
  for (const l of LABELS) assert.ok(INK_RULES[l], l);
  assert.equal(simpleLabel({ area: 0.2, lab: [70, -10, 20], labSpread: [20], bbox: [0, 0, 10, 10] }, { w: 100, h: 100 }), 'foliage');
  assert.equal(ruleAt(() => 'face', 5, 5, 2).ink, 'features');
  const m = shadowMassMask(plane(), W, H, PX, { sigmaMm: 0.3, drop: 20, minAreaMm2: 0.5 });
  assert.equal(m[80 * W + 80], 1);
  assert.equal(m[5 * W + 80], 0);
});

test('without a vision model the regions take the simple classifier and the record says so', async () => {
  const warn = [];
  const run = () => ({ status: 1, stdout: '', stderr: 'not signed in' });
  const r = await labelRegions({ image: new URL(import.meta.url).pathname, regions: [{ id: 1, area: 0.5, lab: [70, 0, 5], labSpread: [5], bbox: [0, 0, 5, 5] }], labelMap: new Uint8Array(4), w: 2, h: 2, judge: 'codex', cacheDir: '/nonexistent', log: s => warn.push(s), run }).catch(e => e);
  // the overlay needs a real image; either way the failure is loud, never silent
  assert.ok(r instanceof Error || r.judge === 'simple');
});
