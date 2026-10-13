// The stroke gate measures every run from the painter's own tape (src/paint/stroke-ledger.mjs), and an unmeasured
// painting is never reported as ok.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { normalize, summarize, tapeStats } from './stroke-stats.mjs';
import { evaluateGate } from './stroke-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('an unverified painting is never ok, in any gate mode', () => {
  const s = summarize(normalize({ w: 100, h: 50, scale: 10, sheetWidthMm: 200, brushes: [0], brushOpts: [{ radius: 10 }], marks: [{ k: 's', b: 0, d: [[0, 100], [900, 100]] }] }));
  for (const mode of ['warn', 'reject']) {
    const g = evaluateGate(s, { mode });
    assert.equal(g.verified, false);
    assert.equal(g.ok, false, `${mode}: unverified must not read as ok`);
    assert.equal(g.status, 'unverified');
    assert.equal(g.blocks, mode === 'reject');
  }
});

test('stroke stats read a command log as a stream, never as one string', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tape-stats-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const log = path.join(dir, 'value-commands.jsonl');
  fs.writeFileSync(log, '{"id":"c1","status":"SKIPPED"}\n{"id":"c2","status":"SKIPPED"}\n');
  // stands in for a native command log longer than V8's longest string
  const read = fs.readFileSync;
  fs.readFileSync = function (f, ...a) { if (String(f) === log) throw new RangeError('Invalid string length'); return read.call(this, f, ...a); };
  t.after(() => { fs.readFileSync = read; });
  const tape = { w: 100, h: 50, scale: 10, sheetWidthMm: 200, base: [250, 248, 240], brushes: [0], brushOpts: [{ radius: 10 }], marks: [{ k: 's', b: 0, d: [[0, 100], [900, 100]] }] };
  const s = await tapeStats(tape, dir);
  assert.equal(s.counts.paint, 1);
  assert.equal(s.source, 'painter tape');
});

const plannedWash = () => ({
  tape: { w: 100, h: 60, scale: 10, sheetWidthMm: 100, base: [255, 255, 255], pigments: [{ K: [1, .5, .2] }], brushes: [0], brushOpts: [{ radius: 15, film: .25, capacity: 100 }],
    marks: [{ k: 'd', b: 0, w: 1, c: [.5] }, { k: 's', b: 0, d: [[100, 300, 100], [900, 300, 100]] }] },
  plan: { passes: [{ id: 'wall', phase: 'light', valueBand: 1, area: 4000, regions: [], resolution: { mmPerCell: 1, estimatedSupportWidthCells: 40 },
    edges: { hardCells: [], softCells: Array.from({ length: 6000 }, (_, i) => i) } }] },
  commands: [{ status: 'EXECUTED', intent: 'wall', geometry: [{ x: 10, y: 30 }, { x: 90, y: 30 }] }],
});

test('soft planned edges no longer hide every broad wash from the gate; hard edges still exempt accents', () => {
  const { tape, plan, commands } = plannedWash();
  const s = summarize(normalize(tape), { plan, commands });
  assert.equal(s.composition.broadAreasMeasured, true, 'a wash whose plan marks every cell as a soft edge is still measured');
  assert.equal(evaluateGate(s).status, 'passed');
  plan.passes[0].edges = { hardCells: plan.passes[0].edges.softCells, softCells: [] };
  assert.equal(summarize(normalize(tape), { plan, commands }).composition.broadAreasMeasured, false);
});

const ARGS = ['tools/paint-plate.mjs', '--recipe', 'none', '--image', 'bench/v2/targets/hills.png', '--width', '64', '--scale', '1', '--sheetmm', '80', '--palettewide', '1',
  '--physical', '1', '--order', 'painter', '--midlayers', '2', '--drawing', 'both', '--outlinemedium', 'ink', '--texture', '0',
  '--mode', 'fast', '--video', '0', '--targetguard', 'gentle', '--seed', '0', '--gpu', 'off', '--allowdirty', '1'];
const paint = (args, log) => new Promise(resolve => {
  const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(log, 'a')] });
  p.on('close', resolve);
});

test('without --marks the painter still measures the stroke gate, writes no marks.json and paints the same picture', async t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'stroke-ledger-'));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const lean = path.join(work, 'lean'), full = path.join(work, 'full');
  const [a, b] = await Promise.all([paint([...ARGS, '--marks', '0', '--out', lean], path.join(work, 'lean.log')), paint([...ARGS, '--marks', '1', '--out', full], path.join(work, 'full.log'))]);
  assert.equal(a, 0, fs.readFileSync(path.join(work, 'lean.log'), 'utf8').slice(-800));
  assert.equal(b, 0, fs.readFileSync(path.join(work, 'full.log'), 'utf8').slice(-800));
  assert.equal(fs.existsSync(path.join(lean, 'marks.json')), false);
  assert.equal(fs.existsSync(path.join(full, 'marks.json')), true);
  const stats = JSON.parse(fs.readFileSync(path.join(lean, 'stroke-stats.json'), 'utf8'));
  const fullStats = JSON.parse(fs.readFileSync(path.join(full, 'stroke-stats.json'), 'utf8'));
  assert.ok(stats.counts.paint > 0, 'strokes were measured');
  assert.deepEqual(stats.counts, fullStats.counts);
  assert.deepEqual(stats.histograms, fullStats.histograms);
  const gate = JSON.parse(fs.readFileSync(path.join(lean, 'stroke-gate.json'), 'utf8'));
  assert.equal(typeof gate.verified, 'boolean');
  assert.doesNotMatch(fs.readFileSync(path.join(work, 'lean.log'), 'utf8'), /use --marks 1/);
  const pixels = async f => (await sharp(f).raw().toBuffer()).toString('base64');
  assert.equal(await pixels(path.join(lean, 'painting.png')), await pixels(path.join(full, 'painting.png')), 'recording the ledger must not change the painting');
});
