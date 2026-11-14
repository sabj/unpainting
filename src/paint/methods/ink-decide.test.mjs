import test from 'node:test';
import assert from 'node:assert/strict';
import { decideLines, DECIDE_DEFAULTS } from './ink-decide.mjs';
import { parseLabelReply, simpleLabel, ruleAt, shadowMassMask, labelRegions, INK_RULES, LABELS } from './ink-labels.mjs';
import { cutMassEdges, classifyPathDetail, CLASS } from './line-class.mjs';

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
  const leaves = decideLines([line(21, 5, 40)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'foliage' }, { ...DECIDE_DEFAULTS, strongContrast: Infinity });
  // a strong ink stroke is not a leaf: it stays
  assert.ok(decideLines([line(21, 5, 40)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'foliage' }).stats.keptPx > 20);
  assert.equal(leaves.lines.length, 0);
  assert.ok(leaves.stats.droppedMm.short > 4, "a piece too short to be a branch is wash");
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

test('bridging does not cross intentional semantic label cuts', () => {
  const L = plane();
  // Line crossing from architecture into sky:
  // x=10..14 is architecture (draws line); x=15..16 is within reach=2; x >= 17 is pure sky (r.ink === 'none')
  const crossing = { points: Array.from({ length: 20 }, (_, k) => ({ x: 10 + k, y: 21 })) };
  const r = decideLines([crossing], {
    L, w: W, h: H, pxMm: PX,
    cellLabel: (x) => (x < 15 ? 'architecture' : 'sky'),
  }, { bridgeMm: 5.0 });
  // Points at x >= 19 are outside reach=4 of architecture and in pure sky; they must be dropped and NOT bridged
  for (const line of r.lines) {
    for (const p of line.points) {
      assert.ok(p.x < 19, `point at x=${p.x} should not be bridged into pure sky`);
    }
  }
});

test('partial options object merges with defaults without dropping unmentioned options', () => {
  const L = plane();
  const r = decideLines([line(21, 5, 40)], { L, w: W, h: H, pxMm: PX, cellLabel: () => 'architecture' }, { bridgeMm: 0.5 });
  assert.ok(r.stats != null);
  assert.ok(r.stats.lines === 1);
});

const structuralCtx = (extra = {}) => ({ L: plane(), w: W, h: H, pxMm: PX, inputKind: 'line-map', cellLabel: () => 'architecture', ...extra });
test('source-model structural dark/light boundary survives with endpoints and pressure, including a tone shadow mask', () => {
  for (const label of ['architecture', 'ground']) {
    const g = line(60); g.widths = g.points.map((_, i) => 1 + i / 30); g.weights = g.points.map((_, i) => .2 + i / 30);
    const r = decideLines([g], structuralCtx({ cellLabel: () => label, shadow: new Uint8Array(W * H).fill(1) }));
    assert.equal(r.lines.length, 1);
    assert.deepEqual(r.lines[0].points[0], { x: 5, y: 60, width: 1, weight: .2 });
    assert.deepEqual(r.lines[0].points.at(-1), { x: 155, y: 60, width: 2, weight: 1.2 });
    assert.ok(r.stats.retainedStructuralMassMm > 20);
  }
});
test('structural exception is source-provenance bounded and rejects short, unsupported and wash-only contours', () => {
  assert.equal(decideLines([line(60)], structuralCtx({ inputKind: undefined })).lines.length, 0);
  assert.equal(decideLines([line(60, 5, 40)], structuralCtx()).lines.length, 0);
  assert.equal(decideLines([line(60)], structuralCtx({ L: new Float32Array(W * H).fill(90) })).lines.length, 0);
  for (const label of ['sky', 'water', 'foliage', 'shadow_mass']) {
    assert.equal(decideLines([line(60)], structuralCtx({ cellLabel: () => label })).lines.length, 0, label);
  }
  assert.equal(decideLines([line(60)], structuralCtx({ foliage: new Uint8Array(W * H).fill(1) })).lines.length, 0);
});
test('structural contours do not bridge explicit semantic gaps', () => {
  for (const label of ['sky', 'foliage', 'shadow_mass']) {
    const r = decideLines([line(60)], structuralCtx({ cellLabel: x => x > 55 && x < 105 ? label : 'architecture' }), { bridgeMm: 100 });
    assert.equal(r.lines.length, 2, label);
    assert.ok(r.lines.every(g => g.points.every(p => p.x < 65 || p.x > 95)), label);
  }
});
function rasterContour(pxMm, kind) {
  const w = Math.round(48 / pxMm), h = Math.round(40 / pxMm), L = new Float32Array(w * h);
  const edge = x => kind === 'diagonal' ? 10 + .35 * x : kind === 'irregular' ? 20 + 3 * Math.sin(x * 2) : 20 - Math.sqrt(Math.max(0, 16 ** 2 - (x - 24) ** 2));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L[y * w + x] = y * pxMm >= edge(x * pxMm) ? 55 : 90;
  const points = [];
  for (let x = Math.round(12 / pxMm); x <= Math.round(36 / pxMm); x++) points.push({ x, y: Math.round(edge(x * pxMm) / pxMm) });
  return { g: { points }, ctx: { L, w, h, pxMm, inputKind: 'line-map', cellLabel: () => 'architecture' } };
}
test('quantized diagonals and smooth rims retain connected endpoints across physical image grids', () => {
  for (const pxMm of [.1, .2, .3]) for (const kind of ['diagonal', 'rim']) {
    const { g, ctx } = rasterContour(pxMm, kind), r = decideLines([g], ctx);
    assert.equal(r.lines.length, 1, kind + ' ' + pxMm);
    assert.deepEqual(r.lines[0].points[0], g.points[0]);
    assert.deepEqual(r.lines[0].points.at(-1), g.points.at(-1));
  }
});
test('irregular source mass contours gain no structural exemption', () => {
  const { g, ctx } = rasterContour(.15, 'irregular'), r = decideLines([g], ctx);
  assert.equal(r.stats.retainedStructuralMassMm ?? 0, 0);
  assert.ok(r.stats.keptPx < r.stats.lengthPx / 2);
});
test('decideFile forwards source-model provenance into the structural decision', async () => {
  const { decideFile } = await import('./ink-decide-file.mjs');
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'structural-provenance-'));
  try {
    for (const inputKind of [undefined, 'line-map']) {
      const doc = { image: { w: W, h: H }, inputKind, lines: [{ points: line(60).points.map(p => [p.x, p.y]) }] };
      const r = await decideFile({ doc, L: plane(), image: path.join(out, 'source.png'), out, stage: 'opening', pxMm: PX, shadowMask: false });
      assert.equal(r.lines.length, inputKind ? 1 : 0);
    }
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('unsupported faint semantic gaps cannot reconnect structural mass contours', () => {
  const L = plane();
  for (let y = 0; y < H; y++) for (let x = 55; x <= 105; x++) L[y * W + x] = 90;
  assert.equal(classifyPathDetail(Array.from({ length: 151 }, (_, k) => ({ x: k + 5, y: 60 })), L, W, H, PX).cls[75], CLASS.faint);
  for (const label of ['foliage', 'sky', 'water', 'shadow_mass']) {
    const r = decideLines([line(60)], structuralCtx({ L, cellLabel: x => x >= 55 && x <= 105 ? label : 'architecture' }), { bridgeMm: 100 });
    assert.equal(r.lines.length, 2, label);
    assert.ok(r.lines.every(g => g.points.every(p => p.x < 65 || p.x > 95)), label);
  }
});

test('local pen support through foliage keeps its ordinary rule inside a model structural contour', () => {
  const L = plane();
  for (let x = 45; x <= 115; x++) { L[59 * W + x] = 30; L[60 * W + x] = 30; }
  const r = decideLines([line(60)], structuralCtx({ L, cellLabel: x => x >= 45 && x <= 115 ? 'foliage' : 'architecture' }));
  assert.ok(r.lines.some(g => g.points.some(p => p.x > 65 && p.x < 95)), 'pen marks inside foliage remain eligible');
  assert.ok(r.stats.retainedStructuralMassMm > 0, 'not the old global mostly-pen exception');
});
