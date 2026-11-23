// 0.4's scoring tests (bench/scorer/score04-test.py, a stub judge: no model is called), run under BENCH_SCORE_PYTHON
// (else the checkout's .venv-seg python when there is one, else python3). A python without bench/scorer/requirements.txt
// FAILS with a plain message: a skipped scoring test proves nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const venv = [path.join(ROOT, '.venv-seg', 'bin', 'python'), path.join(ROOT, '..', '..', '.venv-seg', 'bin', 'python')].find(f => fs.existsSync(f));
const PY = process.env.BENCH_SCORE_PYTHON || venv || 'python3';
const NOT_READY = `${PY} cannot import the scoring packages (bench/scorer/requirements.txt: numpy, scipy, scikit-image, pillow). Set BENCH_SCORE_PYTHON to a python that has them (the segmentation venv does). This is a failure, not a skip: an untested scorer proves nothing.`;
const ready = spawnSync(PY, ['-c', 'import numpy, scipy, skimage, PIL'], { encoding: 'utf8' }).status === 0;

test('python bench/scorer/score04-test.py', { timeout: 300000 }, () => {
  assert.ok(ready, NOT_READY);
  const r = spawnSync(PY, ['-B', 'bench/scorer/score04-test.py'], { cwd: ROOT, encoding: 'utf8', timeout: 290000 });
  assert.equal(r.status, 0, r.stderr.slice(-3000));
  assert.match(r.stderr, /Ran [1-9]\d* tests? in [\d.]+s\n+OK/);
});

test('bench:score04 with no inputs says how to use it and fails', () => {
  assert.ok(ready, NOT_READY);
  const r = spawnSync('node', ['bench/scripts/score04.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, BENCH_SCORE_PYTHON: PY } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: bench:score04/);
});

test('bench:score04 on a hosted route with no key refuses plainly before reading anything', () => {
  assert.ok(ready, NOT_READY);
  const env = { ...process.env, BENCH_SCORE_PYTHON: PY, JUDGE_ROUTE: 'together' };
  delete env.TOGETHER_API_KEY;
  const r = spawnSync('node', ['bench/scripts/score04.mjs', 'no-such-run', '--out', 'no-such-out'], { cwd: ROOT, encoding: 'utf8', env });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /JUDGE_ROUTE=together needs TOGETHER_API_KEY, and it is not set/);
});
