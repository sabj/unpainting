import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { decideFile } from './ink-decide-file.mjs';

const W = 160, H = 100, PX = 0.15;
// a source with two pen lines (row 30 on the left half, row 70 on the right half) on paper; regions: 1 left, 2 right
async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-decide-file-')), px = Buffer.alloc(W * H * 3, 235), lab = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) lab[y * W + x] = x < W / 2 ? 1 : 2;
  for (const [y, x0, x1] of [[30, 5, 75], [70, 85, 155]]) for (let x = x0; x < x1; x++) for (const yy of [y, y + 1]) px.fill(50, 3 * (yy * W + x), 3 * (yy * W + x) + 3);
  const image = path.join(dir, 'target.png'), stem = path.join(dir, 'seg');
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(image);
  await sharp(lab, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`${stem}.png`);
  const region = id => ({ id, name: `r${id}`, foreground: false, area: 0.5, bbox: [0, 40, W / 2, 50], lab: [70, 0, 5], labSpread: [5, 1, 1], frame: 0.1 });
  fs.writeFileSync(`${stem}.json`, JSON.stringify({ image: { w: W, h: H }, legend: { 1: 'r1', 2: 'r2' }, regions: [region(1), region(2)], backend: { backend: 'sam' } }));
  const L = new Float32Array(W * H).fill(92); for (let i = 0; i < W * H; i++) L[i] = 0.2126 * px[3 * i] / 2.55 + 0.7152 * px[3 * i + 1] / 2.55 + 0.0722 * px[3 * i + 2] / 2.55;
  const line = (y, x0, x1) => ({ points: Array.from({ length: 36 }, (_, k) => [x0 + (x1 - x0) * k / 35, y + 0.5]), inputKind: 'line-map' });
  return { dir, image, stem, L, doc: { image: { w: W, h: H }, lines: [line(30, 5, 75), line(70, 85, 155)] } };
}
// The label cache is keyed by the model, so a vision judge must be named; the reply itself is stubbed.
const LABEL_ENV = { ...process.env, INK_LABEL_MODEL: 'test-model' };
const replying = json => () => ({ status: 0, stdout: JSON.stringify(json), stderr: '' });

test('a vision model labels the regions, the sky line is wash and the architecture line is drawn, and the record says so', async () => {
  const s = await setup(), logs = [];
  const r = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', env: LABEL_ENV, cacheDir: path.join(s.dir, 'cache'), log: m => logs.push(m), run: replying({ 1: 'architecture', 2: 'sky' }) });
  assert.equal(r.lines.length, 1);
  assert.ok(r.lines[0].points.every(([x]) => x < W / 2 + 1));
  const rec = JSON.parse(fs.readFileSync(path.join(s.dir, 'ink-labels.json'), 'utf8'));
  assert.deepEqual(rec.regions.map(g => [g.id, g.label, g.from, g.ink]), [[1, 'architecture', 'vision', 'structure'], [2, 'sky', 'vision', 'none']]);
  assert.equal(rec.judge, 'codex');
  assert.ok(rec.stats.droppedMm.label.sky > 5);
  // the labels are cached by the target's hash: a second call asks nobody
  const again = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', env: LABEL_ENV, cacheDir: path.join(s.dir, 'cache'), log: () => {}, run: () => { throw new Error('asked again'); } });
  assert.equal(again.record.cached, true);
  assert.equal(again.lines.length, 1);
});

test('a requested vision judge that cannot run stops the decision; it does not fall back to the simple classifier', async () => {
  const s = await setup();
  const failing = () => ({ status: 1, stdout: '', stderr: 'not signed in' });
  await assert.rejects(decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', env: LABEL_ENV, cacheDir: path.join(s.dir, 'cache'), run: failing }),
    /ink labels \(codex\): label process failed/);
  assert.ok(!fs.existsSync(path.join(s.dir, 'ink-labels.json')), 'no label record is written for a failed judge');
});

test('face and hands are never taken for shadow: a pen line in a dark face region stays', async () => {
  const s = await setup();
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) if (!(y === 30 || y === 31)) s.L[y * W + x] = 40; // the left half is a dark mass, the line only 12 L* darker
  for (let x = 5; x < 75; x++) for (const y of [30, 31]) s.L[y * W + x] = 28;
  const r = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', env: LABEL_ENV, cacheDir: path.join(s.dir, 'cache'), log: () => {}, run: replying({ 1: 'face', 2: 'sky' }) });
  assert.ok(r.lines.some(g => g.points[0][0] < W / 2));
});

test('pieces of one contour are joined before the decision, so a contour is decided and drawn as one line', async () => {
  const s = await setup();
  const piece = (x0, x1) => ({ points: Array.from({ length: 12 }, (_, k) => [x0 + (x1 - x0) * k / 11, 30.5]), inputKind: 'line-map' });
  const doc = { image: { w: W, h: H }, inputKind: 'line-map', lines: [piece(5, 25), piece(32, 52), piece(59, 75)] };
  const joined = await decideFile({ doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, shadowMask: false, joinMm: 2.5 });
  assert.equal(joined.lines.length, 1);
  assert.equal(joined.record.stats.chained.before, 3);
  assert.equal(joined.record.stats.chained.after, 1);
  const apart = await decideFile({ doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, shadowMask: false });
  assert.equal(apart.lines.length, 3, 'with no join distance the pieces stay as they came');
});

test('authored plan lines are pruned by the target, not by region labels: a sky label does not cut them, a mass edge is structure, a mass interior is not', async () => {
  const s = await setup();
  for (let y = 50; y < H; y++) for (let x = 20; x < 155; x++) s.L[y * W + x] = 40; // a dark mass, its top edge at row 50 has no pen line
  const mk = (y, x0, x1) => ({ points: Array.from({ length: 36 }, (_, k) => [x0 + (x1 - x0) * k / 35, y + 0.5]) });
  const doc = { image: { w: W, h: H }, lines: [mk(30, 5, 75), mk(50, 25, 150), mk(80, 25, 150)] };
  const run = replying({ 1: 'sky', 2: 'architecture' });
  const ys = r => r.lines.map(g => Math.round(g.points[0][1])).sort((a, b) => a - b);
  const common = { doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', env: LABEL_ENV, cacheDir: path.join(s.dir, 'cache'), log: () => {}, run, shadowMask: false };
  const authored = await decideFile({ ...common, authored: true });
  assert.deepEqual(ys(authored), [31, 51], 'the line under a sky label and the mass edge stay; the line across the mass goes');
  const rec = JSON.parse(fs.readFileSync(path.join(s.dir, 'ink-labels.json'), 'utf8'));
  assert.match(rec.note, /authored/);
  const model = await decideFile({ ...common, authored: false });
  assert.ok(!ys(model).includes(31), 'a model line under a sky label is wash');
});

test('kept lines are faired: a traced line with a quarter millimetre of tremor leaves as a straight run, and the record counts it', async () => {
  const s = await setup();
  let st = 99; const r0 = () => (st = (st * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5;
  const tremor = { points: Array.from({ length: 70 }, (_, k) => [5 + k + 0.5 * r0() / PX * 0.4, 30.5 + 0.4 * r0() / PX]), inputKind: 'line-map' };
  const doc = { image: { w: W, h: H }, inputKind: 'line-map', lines: [tremor] };
  const r = await decideFile({ doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, shadowMask: false });
  assert.equal(r.lines.length, 1);
  assert.equal(r.record.fair.line, 1);
  const ys = r.lines[0].points.map(([, y]) => y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 0.15 / PX, 'straight to within 0.15 mm');
});

test('a wandering line is a scribble when a model traced it and a curl when the plan drew it: only the traced one is left to the wash', async () => {
  const s = await setup();
  const curl = { points: Array.from({ length: 200 }, (_, k) => [20 + k * 0.5, 30.5 + 7 * Math.sin(k / 199 * Math.PI * 6)]) };
  const doc = authored => ({ image: { w: W, h: H }, inputKind: authored ? undefined : 'line-map', lines: [curl] });
  for (const [x, y] of curl.points) for (const dy of [-1, 0, 1]) s.L[Math.round(y + dy) * W + Math.round(x)] = 40;   // a pen line along it
  const common = { L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, shadowMask: false };
  assert.equal((await decideFile({ ...common, doc: doc(true), authored: true })).lines.length, 1, 'authored curls stay');
  assert.equal((await decideFile({ ...common, doc: doc(false) })).lines.length, 0, 'a traced scribble goes');
});

test('pieces of one ridge join even when each carries the trace grid tremor: they are faired first, then chained into one line', async () => {
  const s = await setup();
  let st = 7; const r0 = () => (st = (st * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5;
  const piece = (x0, x1) => ({ points: Array.from({ length: 24 }, (_, k) => [x0 + (x1 - x0) * k / 23 + 0.3 * r0(), 30.5 + 1.8 * r0()]), inputKind: 'line-map' });
  const doc = { image: { w: W, h: H }, inputKind: 'line-map', lines: [piece(5, 25), piece(28, 48), piece(51, 71)] };
  const r = await decideFile({ doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, shadowMask: false, joinMm: 2.5 });
  assert.equal(r.lines.length, 1, 'one ridge, one line');
  assert.equal(r.record.fair.line, 1, 'drawn as one straight run');
});

test('a short line the evidence cut that joins two kept lines is restored: a voussoir joint between two mouldings', async () => {
  const s = await setup();
  const L = new Float32Array(W * H).fill(90);
  for (const y of [30, 31, 70, 71]) for (let x = 5; x < 155; x++) L[y * W + x] = 40;
  const row = y => ({ points: Array.from({ length: 150 }, (_, k) => [5 + k, y + 0.5]), inputKind: 'line-map' });
  const joint = { points: Array.from({ length: 38 }, (_, k) => [80.5, 32 + k]), inputKind: 'line-map' };
  const doc = { image: { w: W, h: H }, inputKind: 'line-map', lines: [row(30), row(70), joint] };
  const r = await decideFile({ doc, L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, shadowMask: false });
  assert.equal(r.lines.length, 3, 'the joint is back');
  assert.equal(r.record.bridged, 1);
});

test('a long line as dark as the source\'s ink may wander, a short or pale one may not: the gnarled trunk stays, the scribble goes', async () => {
  const s = await setup();
  const L = new Float32Array(W * H).fill(90);
  const wave = (y0, x0, n, amp) => Array.from({ length: n }, (_, k) => [x0 + k * 0.5, y0 + amp * Math.sin(k / (n - 1) * Math.PI * 6)]);
  const dark = wave(22, 5, 280, 6), pale = wave(60, 5, 280, 6), short = wave(42, 20, 90, 6);
  const paint = (pts, v) => { for (const [x, y] of pts) for (const dy of [-1, 0, 1]) L[Math.round(y + dy) * W + Math.round(x)] = v; };
  paint(dark, 20); paint(pale, 60); paint(short, 20);
  // confident pen lines at L 20 make the source's ink level 20; the pale line is lighter than that
  const rows = [74, 80, 86, 92, 98];
  for (const y of rows) for (let x = 5; x < 155; x++) L[y * W + x] = 20;
  const doc = { image: { w: W, h: H }, inputKind: 'stroke', lines: [{ points: dark }, { points: pale }, { points: short }, ...rows.map(y => ({ points: Array.from({ length: 150 }, (_, k) => [5 + k, y + 0.5]) }))] };
  const r = await decideFile({ doc, L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, shadowMask: false, inkDarkRule: true });
  const mids = r.lines.map(g => Math.round(g.points[g.points.length >> 1][1]));
  assert.ok(mids.some(y => y >= 16 && y <= 28), 'the long dark wandering line is kept');
  assert.ok(!mids.some(y => y >= 54 && y <= 66), 'the pale one goes');
  assert.ok(!mids.some(y => y >= 36 && y <= 48), 'the short one goes');
});
