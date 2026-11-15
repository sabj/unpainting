import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { decideFile } from './ink-decide-file.mjs';

const W = 160, H = 100, PX = 0.15;
// a source with two pen lines (row 30 on the left half, row 70 on the right half) on paper; regions: 1 left, 2 right
async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-decide-file-')), px = Buffer.alloc(W * H * 3, 235), lab = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) lab[y * W + x] = x < W / 2 ? 1 : 2;
  for (const [y, x0, x1] of [[30, 5, 75], [70, 85, 155]]) for (let x = x0; x < x1; x++) for (const yy of [y, y + 1]) px.fill(50, 3 * (yy * W + x), 3 * (yy * W + x) + 3);
  const previous = Object.fromEntries(['INK_LABEL_MODEL', 'CODEX_BIN'].map(key => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const executable = path.join(dir, 'injected-label-runner');
  fs.writeFileSync(executable, '#!/bin/sh\nexit 99\n', { mode: 0o700 });
  process.env.CODEX_BIN = executable;
  process.env.INK_LABEL_MODEL = 'integration-test-model';
  const image = path.join(dir, 'target.png'), stem = path.join(dir, 'seg');
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(image);
  await sharp(lab, { raw: { width: W, height: H, channels: 1 } }).png().toFile(`${stem}.png`);
  const region = id => ({ id, name: `r${id}`, foreground: false, area: 0.5, bbox: [0, 40, W / 2, 50], lab: [70, 0, 5], labSpread: [5, 1, 1], frame: 0.1 });
  fs.writeFileSync(`${stem}.json`, JSON.stringify({ image: { w: W, h: H }, legend: { 1: 'r1', 2: 'r2' }, regions: [region(1), region(2)], backend: { backend: 'sam' } }));
  const L = new Float32Array(W * H).fill(92); for (let i = 0; i < W * H; i++) L[i] = 0.2126 * px[3 * i] / 2.55 + 0.7152 * px[3 * i + 1] / 2.55 + 0.0722 * px[3 * i + 2] / 2.55;
  const line = (y, x0, x1) => ({ points: Array.from({ length: 36 }, (_, k) => [x0 + (x1 - x0) * k / 35, y + 0.5]), inputKind: 'line-map' });
  return { dir, image, stem, L, doc: { image: { w: W, h: H }, lines: [line(30, 5, 75), line(70, 85, 155)] } };
}
const replying = json => (_command, args) => {
  assert.equal(args[args.indexOf('--model') + 1], 'integration-test-model');
  return { status: 0, stdout: JSON.stringify(json), stderr: '' };
};

test('a vision model labels the regions, the sky line is wash and the architecture line is drawn, and the record says so', async t => {
  const s = await setup(t), logs = [];
  const r = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', cacheDir: path.join(s.dir, 'cache'), log: m => logs.push(m), run: replying({ 1: 'architecture', 2: 'sky' }) });
  assert.equal(r.lines.length, 1);
  assert.ok(r.lines[0].points.every(([x]) => x < W / 2 + 1));
  const rec = JSON.parse(fs.readFileSync(path.join(s.dir, 'ink-labels.json'), 'utf8'));
  assert.deepEqual(rec.regions.map(g => [g.id, g.label, g.from, g.ink]), [[1, 'architecture', 'vision', 'structure'], [2, 'sky', 'vision', 'none']]);
  assert.equal(rec.judge, 'codex');
  assert.ok(rec.stats.droppedMm.label.sky > 5);
  // the complete source/map/model/executable identity is unchanged: a second call asks nobody
  const again = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', cacheDir: path.join(s.dir, 'cache'), log: () => {}, run: () => { throw new Error('asked again'); } });
  assert.equal(again.record.cached, true);
  assert.equal(again.lines.length, 1);
});

test('requested vision failure stops before a decision record or simple substitute is written', async t => {
  const s = await setup(t), logs = [];
  await assert.rejects(decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', cacheDir: path.join(s.dir, 'cache'), log: m => logs.push(m), run: () => ({ status: 1, stdout: '', stderr: 'not signed in' }) }), /ink labels \(codex\): label process failed/);
  assert.equal(fs.existsSync(path.join(s.dir, 'ink-labels.json')), false);
  assert.equal(fs.existsSync(path.join(s.dir, 'cache')), false);
  assert.equal(logs.some(m => /simple classifier/.test(m)), false);
});

test('face and hands are never taken for shadow: a pen line in a dark face region stays', async t => {
  const s = await setup(t);
  for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) if (!(y === 30 || y === 31)) s.L[y * W + x] = 40; // the left half is a dark mass, the line only 12 L* darker
  for (let x = 5; x < 75; x++) for (const y of [30, 31]) s.L[y * W + x] = 28;
  for (const label of ['face', 'hands']) {
    const r = await decideFile({ doc: s.doc, L: s.L, image: s.image, out: s.dir, stage: 'opening', pxMm: PX, segments: { stem: s.stem }, judge: 'codex', cacheDir: path.join(s.dir, 'cache-' + label), log: () => {}, run: replying({ 1: label, 2: 'sky' }) });
    assert.ok(r.lines.some(g => g.points[0][0] < W / 2), label + ' pen feature survives the shadow mask');
    assert.equal(r.record.regions.find(r => r.id === 1).from, 'vision');
  }
});
