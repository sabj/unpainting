// node --test src/paint/film-timeline.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurve, milestones, retimePositions, medianMilestones, phaseShares, targetMilestones, codeForImage, closingInkFrom, concatList, MILESTONES } from './film-timeline.mjs';

const W = 120, H = 90, PAPER = 250;
const sheet = () => ({ data: new Float32Array(W * H).fill(PAPER), width: W, height: H });
const clone = f => ({ ...f, data: Float32Array.from(f.data) });
const line = (f, y, v) => { for (let x = 10; x < 110; x++) f.data[y * W + x] = v; return f; };
const wash = (f, x0, x1, v) => { for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) f.data[y * W + x] = Math.min(f.data[y * W + x], v); return f; };

test('a pen line reads as line, a wash over an area as wash', () => {
  const a = sheet(), b = line(clone(a), 40, 60), c = wash(clone(b), 0, 60, 200), d = wash(clone(c), 60, 120, 200);
  const cv = buildCurve([a, b, c, d]);
  assert.equal(cv[1].washCov, 0);
  assert.ok(cv[1].line > 0.99);
  assert.ok(cv[2].washCov > 0.45 && cv[2].washCov < 0.55);
  assert.ok(cv[3].line < 0.2);
  assert.equal(cv[3].paint, 1);
});

test('a sheet a few levels darker all over is exposure, not paint', () => {
  const a = sheet(), b = line(clone(a), 40, 60);
  const dim = clone(b); for (let i = 0; i < dim.data.length; i++) dim.data[i] *= 0.985;
  const cv = buildCurve([a, dim, b]);
  assert.ok(Math.abs(cv[1].paint - 1) < 0.05);
  assert.equal(cv[1].washCov, 0);
});

test('milestones interpolate between samples and never go backwards', () => {
  const curve = [0, 0.2, 0.6, 1].map((v, i) => ({ paint: v, washDen: [0, 0, 0.5, 1][i], washCov: [0, 0, 0.8, 1][i], dark: [0, 0.1, 0.2, 1][i] }));
  const m = milestones(curve, [0, 0.25, 0.5, 1]);
  assert.ok(m.washStart > 0.25 && m.washStart < 0.5);
  for (let k = 1; k < MILESTONES.length; k++) assert.ok(m[MILESTONES[k]] >= m[MILESTONES[k - 1]]);
  const s = phaseShares(m);
  assert.ok(Math.abs(Object.values(s).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('re-timing maps run milestones onto target milestones, ends fixed', () => {
  const p = retimePositions(11, { washStart: 2, washHalf: 3, darkHalf: 5, late: 7, inkStart: 8 }, { washStart: 0.3, washHalf: 0.45, darkHalf: 0.6, late: 0.7, inkStart: 0.85 });
  assert.equal(p[0], 0); assert.equal(p[10], 1);
  assert.ok(Math.abs(p[2] - 0.3) < 1e-9 && Math.abs(p[8] - 0.85) < 1e-9);
  for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1]);
});

test('a code with no curve falls back to the median of the others', () => {
  const mk = x => Object.fromEntries(MILESTONES.map((k, i) => [k, x + i * 0.1]));
  const man = { subjects: { A: { art: 'A-art.png', oldArt: 'a.png', timeline: { milestones: mk(0.1) } }, B: { timeline: { milestones: mk(0.2) } }, C: { timeline: { milestones: mk(0.4) } } } };
  assert.equal(targetMilestones(man, 'A').fallback, false);
  const f = targetMilestones(man, 'Z');
  assert.equal(f.fallback, true);
  assert.ok(Math.abs(f.milestones.washStart - 0.2) < 1e-9);
  assert.deepEqual(medianMilestones([mk(0.1), mk(0.3)]).washStart, 0.2);
  assert.equal(codeForImage(man, 'data/refs/x/a.png'), 'A');
  assert.equal(codeForImage(man, 'data/refs/x/other.png'), null);
});

test('closing ink is the first ink frame after paint; the concat list holds frames for their share', () => {
  assert.equal(closingInkFrom([{ stage: 'paper' }, { stage: 'pen' }, { stage: 'paint' }, { stage: 'ink' }, { stage: 'finished' }]), 3);
  assert.equal(closingInkFrom([{ stage: 'paper' }, { stage: 'ink' }, { stage: 'paint' }]), null);
  const l = concatList(['a', 'b', 'c'], [0, 0, 1], 3).split('\n');
  assert.ok(!l.includes("file 'a'"));
  assert.ok(l.includes('duration 3.0000'));
});

test('the wash starts after the opening pen, whatever the pen measures as wash', async () => {
  const { openingPenUntil, milestones: ms } = await import('./film-timeline.mjs');
  const frames = [{ stage: 'paper' }, { stage: 'pen' }, { stage: 'pen' }, { stage: 'paint' }, { stage: 'ink' }];
  assert.equal(openingPenUntil(frames), 2);
  const curve = [0, 0.06, 0.05, 0.3, 1].map(v => ({ washDen: v, washCov: v, dark: v, paint: v }));
  assert.equal(ms(curve, [0, 1, 2, 3, 4]).washStart < 1, true);
  assert.equal(ms(curve, [0, 1, 2, 3, 4], { washFrom: 2 }).washStart, 2);
});
