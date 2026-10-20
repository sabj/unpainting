// Frame capture is read-only: the film options (--frames, --keepallframes, --video) choose pictures, never the painting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MARKS_PER_PAINTING, passDue, markDue } from './pass-cadence.mjs';
import { expandRecipe } from './recipe.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the mark cadence is about MARKS_PER_PAINTING a painting and every pass when there are fewer', () => {
  const due = passes => Array.from({ length: passes }, (_, L) => markDue(L, passes)).filter(Boolean).length;
  assert.equal(due(10), 10);
  assert.equal(due(284), Math.ceil(284 / Math.round(284 / MARKS_PER_PAINTING)));
  assert.equal(passDue(4, 284, 120), true);
  assert.equal(passDue(4, 284, 40), false);
  assert.throws(() => passDue(0, 10, 0), /positive/);
  assert.equal(markDue(4, 284, '8'), false);
  assert.equal(markDue(36, 284, '8'), true);
});

test('the recipes pin the mark cadence to their old --frames, and a later --frames does not move it', () => {
  for (const recipe of ['default', 'v096']) {
    const argv = expandRecipe({ argv: ['--recipe', recipe, '--frames', '120'] }).argv;
    const get = name => argv[argv.lastIndexOf('--' + name) + 1];
    assert.equal(get('markcadence'), '8', recipe);
    assert.equal(get('frames'), '120', recipe);
  }
});

const ARGS = ['tools/paint-plate.mjs', '--recipe', 'none', '--image', 'bench/v2/targets/hills.png', '--width', '64', '--scale', '1', '--sheetmm', '80',
  '--palettewide', '1', '--physical', '1', '--order', 'painter', '--midlayers', '2', '--texture', '0', '--mode', 'fast', '--video', '0',
  '--targetguard', 'gentle', '--seed', '0', '--gpu', 'off', '--allowdirty', '1',
  // segmentation is not under test: off keeps the run free of the SAM python and checkpoint (src/crop/segment-prep.mjs)
  '--segments', 'off'];
const run = (args, log) => new Promise(resolve => {
  const p = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', fs.openSync(log, 'w'), fs.openSync(log, 'a')] });
  p.on('close', resolve);
});

test('filming every stage at a different --frames leaves the painting byte-identical', async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-identity-'));
  const off = path.join(work, 'off'), on = path.join(work, 'on');
  const [a, b] = await Promise.all([
    run([...ARGS, '--out', off], path.join(work, 'off.log')),
    run([...ARGS, '--keepallframes', '1', '--frames', '2', '--out', on], path.join(work, 'on.log')),
  ]);
  assert.equal(a, 0, fs.readFileSync(path.join(work, 'off.log'), 'utf8').slice(-800));
  assert.equal(b, 0, fs.readFileSync(path.join(work, 'on.log'), 'utf8').slice(-800));
  const frames = d => fs.readdirSync(d).filter(f => /^f\d{4}\.jpg$/.test(f)).length;
  assert.ok(frames(on) > frames(off), `capture on kept ${frames(on)} frames, off ${frames(off)}`);
  const feedback = f => fs.readFileSync(f, 'utf8').split('\n').find(l => l.startsWith('feedback:'));
  assert.equal(feedback(path.join(work, 'on.log')), feedback(path.join(work, 'off.log')));
  const [pa, pb] = await Promise.all([off, on].map(d => sharp(path.join(d, 'painting.png')).raw().toBuffer()));
  assert.ok(pa.equals(pb), 'capture changed the painting');
  fs.rmSync(work, { recursive: true, force: true });
});
