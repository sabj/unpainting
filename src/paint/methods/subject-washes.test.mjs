// The subject field's consumers: the value plan's covers and light holds, its passages cut at wash groups, the
// legacy ladder cut the same way, and the wash plan picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { holdSubjectLights, subjectBlockOptions, subjectCovers, washGroupRegions } from './subject-washes.mjs';
import { planLightToDark } from './light-to-dark.mjs';
import { blockInPigments } from '../../crop/blockin.mjs';
import { writeWashPlan } from './wash-plan-image.mjs';

const W = 40, H = 30, N = W * H;
const left = i => i % W < W / 2;
// two subjects, two wash groups, one shadow group; no lights unless a test sets them
const twoSubjects = (lights = new Uint8Array(N)) => {
  const half = Uint16Array.from({ length: N }, (_, i) => (left(i) ? 1 : 2));
  return { subject: half, wash: half, washIds: [1, 2], shadow: new Uint16Array(N).fill(1), shadowIds: [1], lights, formMm: 1,
    labels: half, regions: [{ id: 'a', referenceCue: '', baseMove: 'wet on dry', descriptiveFamily: null }, { id: 'b', referenceCue: '', baseMove: 'wet on dry', descriptiveFamily: null }],
    summary: { groups: [] } };
};

test("subject covers: a flat subject is one wash; a graded one is cut at its own quantiles; no layer crosses a subject", () => {
  // the left subject is flat at 0.3; the right runs from 0.2 to 0.8 down the sheet
  const values = Float32Array.from({ length: N }, (_, i) => (left(i) ? 0.3 : 0.2 + 0.6 * Math.floor(i / W) / (H - 1)));
  const covers = subjectCovers({ subjects: twoSubjects(), values, weights: new Float32Array(N).fill(1), protectedCells: new Uint8Array(N), count: 4, w: W, h: H, mmPerCell: 1, minShape: 4, smoothMm: 1 });
  assert.equal(covers.length, 4);
  assert.equal(covers[0].reduce((a, v) => a + v, 0), N);
  for (let j = 1; j < 4; j++) assert.equal(covers[j].some((v, i) => v && left(i)), false, `layer ${j} stays off the flat subject`);
  assert.ok(covers[1].some((v, i) => v && !left(i)), 'the graded subject gets later layers');
  assert.ok(covers[3].reduce((a, v) => a + v, 0) < covers[1].reduce((a, v) => a + v, 0), 'later layers cover less');
});

test("a subject's lights keep their whole demand, laid in the first middle step", () => {
  const n = 3, lights = Uint8Array.from([1, 0, 0]);
  const steps = [{ band: 1, wt: Float32Array.from([0.1, 0.1, 0.1]) }, { band: 2, tag: 'L0', wt: Float32Array.from([0.2, 0.2, 0.2]) },
    { band: 2, tag: 'L1', wt: Float32Array.from([0.3, 0.3, 0.3]) }, { band: 4, wt: Float32Array.from([0.4, 0.4, 0.4]) }];
  const before = steps.map(s => Float32Array.from(s.wt));
  const out = holdSubjectLights(steps, lights);
  assert.ok(Math.abs(out[1].wt[0] - 0.9) < 1e-6);
  assert.equal(out[2].wt[0], 0); assert.equal(out[3].wt[0], 0);
  assert.ok(Math.abs(out[2].wt[1] - 0.3) < 1e-6, 'other cells keep their later layers');
  for (let i = 0; i < n; i++) assert.ok(Math.abs(out.reduce((a, s) => a + s.wt[i], 0) - before.reduce((a, w) => a + w[i], 0)) < 1e-6);
  steps.forEach((s, k) => assert.deepEqual(s.wt, before[k], 'the steps passed in are left as they were'));
});

test('the value plan keeps every light and middle passage inside one wash group', () => {
  const density = Float32Array.from({ length: N }, (_, i) => 0.3 + 0.4 * Math.floor(i / W) / H);
  const rgb = new Uint8Array(N * 3).fill(150);
  const subjects = twoSubjects();
  const plan = planLightToDark({ w: W, h: H, k: 1, density, demand: density.slice(), rgb, subjects, minShapeCells: 4 });
  const crossing = plan.layers.filter(l => l._valuePhase !== 'shadow').flatMap(l => l.shapes).filter(sh => { const m = sh.mask; let a = false, b = false; for (let i = 0; i < N; i++) if (m[i]) { if (left(i)) a = true; else b = true; } return a && b; });
  assert.equal(crossing.length, 0);
  assert.ok(plan.layers.length > 0);
  assert.equal(plan.regions, subjects, 'the subject field stands in for the colour clustering');
});

test('the legacy ladder cuts its passes at the wash groups and holds subject lights after the first value', () => {
  const A = new Float32Array(N).fill(0.6), lights = Uint8Array.from({ length: N }, (_, i) => (i % W === 5 && Math.floor(i / W) > 3 && Math.floor(i / W) < 25 ? 1 : 0));
  const grown = Uint8Array.from(lights, (v, i) => (v || lights[i - 1] || lights[i + 1] || lights[i + 2] || lights[i - 2] ? 1 : 0));
  const { layers } = blockInPigments(A, 1, W, H, { glaze: 0.12, maxValues: 6, minShape: 4, floorShape: 2, ...subjectBlockOptions(twoSubjects(grown)) });
  for (const l of layers) for (const sh of l.shapes) {
    const m = sh.mask; let a = false, b = false;
    for (let i = 0; i < N; i++) if (m[i]) { if (left(i)) a = true; else b = true; }
    assert.ok(!(a && b), 'no passage spans both subjects');
    if (l.value > 1) assert.equal(m.some((v, i) => v && grown[i]), false, 'held lights are skipped after the first value');
  }
  assert.deepEqual(subjectBlockOptions(null), {});
});

test('wash groups as --segwash regions: ground unless most cells are foreground', () => {
  const subjects = twoSubjects();
  const seg = { regions: [{ foreground: true, mask: Uint8Array.from({ length: N }, (_, i) => (left(i) ? 1 : 0)) }, { foreground: false, mask: Uint8Array.from({ length: N }, (_, i) => (left(i) ? 0 : 1)) }] };
  const r = washGroupRegions(subjects, seg);
  assert.deepEqual(r.map(q => q.foreground), [true, false]);
  assert.ok(Math.abs(r[0].area - 0.5) < 1e-9);
});

test('the wash plan picture is three panels wide, with the subject field beside it', async t => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'washplan-')); t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const mask = Uint8Array.from({ length: N }, (_, i) => (left(i) ? 1 : 0));
  const layers = [{ _valuePhase: 'light', value: 1, shapes: [{ mask, box: { x0: 0, y0: 0, x1: W / 2 - 1, y1: H - 1 } }] }];
  const logs = [];
  await writeWashPlan({ layers, w: W, h: H, out, subjects: twoSubjects(), log: l => logs.push(l) });
  const sharp = (await import('sharp')).default;
  const meta = await sharp(path.join(out, 'wash-plan.png')).metadata();
  assert.equal(meta.width, 3 * W + 12);
  assert.ok(fs.existsSync(path.join(out, 'subject-field.png')));
  assert.match(logs[0], /^wash plan: 1 passes drawn/);
});
