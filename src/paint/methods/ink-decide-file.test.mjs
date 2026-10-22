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
const replying = json => () => ({ status: 0, stdout: JSON.stringify(json), stderr: '' });

test('a vision model labels the regions, the sky line is wash and the architecture line is drawn, and the record says so', async () => {
  const s = await setup(), logs = [];
  const r = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', cacheDir: path.join(s.dir, 'cache'), log: m => logs.push(m), run: replying({ 1: 'architecture', 2: 'sky' }) });
  assert.equal(r.lines.length, 1);
  assert.ok(r.lines[0].points.every(([x]) => x < W / 2 + 1));
  const rec = JSON.parse(fs.readFileSync(path.join(s.dir, 'ink-labels.json'), 'utf8'));
  assert.deepEqual(rec.regions.map(g => [g.id, g.label, g.from, g.ink]), [[1, 'architecture', 'vision', 'structure'], [2, 'sky', 'vision', 'none']]);
  assert.equal(rec.judge, 'codex');
  assert.ok(rec.stats.droppedMm.label.sky > 5);
  // the labels are cached by the target's hash: a second call asks nobody
  const again = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', cacheDir: path.join(s.dir, 'cache'), log: () => {}, run: () => { throw new Error('asked again'); } });
  assert.equal(again.record.cached, true);
  assert.equal(again.lines.length, 1);
});

test('when the model cannot run the regions take the simple classifier, loudly, and the record says so', async () => {
  const s = await setup(), logs = [];
  const r = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', cacheDir: path.join(s.dir, 'cache'), log: m => logs.push(m), run: () => ({ status: 1, stdout: '', stderr: 'not signed in' }) });
  assert.ok(logs.some(m => m.startsWith('!!! ink labels:')));
  const rec = JSON.parse(fs.readFileSync(path.join(s.dir, 'ink-labels.json'), 'utf8'));
  assert.equal(rec.judge, 'simple');
  assert.match(rec.note, /not signed in/);
  assert.ok(rec.regions.every(g => g.from === 'simple'));
  assert.equal(r.lines.length, 2, 'both are architecture to the simple classifier, and both are pen lines');
});

test('face and hands are never taken for shadow: a pen line in a dark face region stays', async () => {
  const s = await setup();
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) if (!(y === 30 || y === 31)) s.L[y * W + x] = 40; // the left half is a dark mass, the line only 12 L* darker
  for (let x = 5; x < 75; x++) for (const y of [30, 31]) s.L[y * W + x] = 28;
  const r = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', cacheDir: path.join(s.dir, 'cache'), log: () => {}, run: replying({ 1: 'face', 2: 'sky' }) });
  assert.ok(r.lines.some(g => g.points[0][0] < W / 2));
});
