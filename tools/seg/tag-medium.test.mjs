import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { segPythonFor } from '../paint/run.mjs';

// tag-medium.py --mode contour, which keeps every stroke (rule A, the owner's pick on Rosewalk, 21 Nov): ink where the
// contour rule inks or the source under the stroke is near-black; every other stroke is light pencil.
// (the segmentation python as the painter finds it: a git worktree without its own uses its main checkout's)
const root = fileURLToPath(new URL('../../', import.meta.url)), python = segPythonFor(root);
const run = (...args) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-medium-'));
  try { return JSON.parse(execFileSync(python, ['tools/seg/tag-medium-cases.py', dir, ...args], { cwd: root, encoding: 'utf8' }).trim().split('\n').pop()); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test('tag-medium --keep pencil: nothing dropped; the pen line and the black blot ink; hatching on a pale wall light pencil', () => {
  assert.ok(fs.existsSync(python), `the segmentation Python environment is missing (${python}); run npm run doctor`);
  const r = run('--keep', 'pencil'), at = q => r.strokes.find(s => s.seq === q);
  assert.equal(r.counts.dropped, 0);
  assert.ok(r.strokes.every(s => !s.drop));
  assert.equal(at(0).medium, 'ink', 'the pen line');
  assert.equal(at(7).medium, 'ink', 'the black blot');
  assert.equal(at(7).fill, true, 'an ink fill stays a fill');
  for (let q = 1; q <= 6; q++) {
    assert.equal(at(q).medium, 'graphite', `hatch ${q}`);
    assert.ok(Math.abs(at(q).dark - 0.2 * at(q).fitDark) < 1e-3, `hatch ${q} at 0.2 of its fitted darkness: ${at(q).dark}`);
  }
  assert.equal(at(8).medium, 'graphite', 'the pale tone');
  assert.ok(Math.abs(at(8).dark - 0.1 * at(8).fitDark) < 1e-3, `the tone a fill at 0.1: ${at(8).dark}`);
});

test('tag-medium --mode contour keeps every stroke by default (rule A); --keep drop is the old contour rule', () => {
  const a = run(), d = run('--keep', 'drop');
  assert.equal(a.counts.dropped, 0);
  assert.ok(d.counts.dropped > 0);
  assert.equal(a.strokes.find(s => s.seq === 7).medium, 'ink');
});
