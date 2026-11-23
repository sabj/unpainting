// 0.4's scoring tests (bench/scorer/score04-test.py, a stub judge: no model is called), run under BENCH_SCORE_PYTHON
// (else python3). A python without bench/scorer/requirements.txt is reported as skipped, never as passed.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PY = process.env.BENCH_SCORE_PYTHON || 'python3';
const ready = spawnSync(PY, ['-c', 'import numpy, scipy, skimage, PIL'], { encoding: 'utf8' }).status === 0;

test('python bench/scorer/score04-test.py', { timeout: 300000 }, t => {
  if (!ready) { t.skip(`${PY} cannot import bench/scorer/requirements.txt; set BENCH_SCORE_PYTHON`); return; }
  const r = spawnSync(PY, ['-B', 'bench/scorer/score04-test.py'], { cwd: ROOT, encoding: 'utf8', timeout: 290000 });
  assert.equal(r.status, 0, r.stderr.slice(-3000));
  assert.match(r.stderr, /Ran [1-9]\d* tests? in [\d.]+s\n+OK/);
});

test('bench:score04 with no inputs says how to use it and fails', t => {
  if (!ready) { t.skip(`${PY} cannot import bench/scorer/requirements.txt`); return; }
  const r = spawnSync('node', ['bench/scripts/score04.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, BENCH_SCORE_PYTHON: PY } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /usage: bench:score04/);
});

test('bench:score04 on a hosted route with no key refuses plainly before reading anything', t => {
  if (!ready) { t.skip(`${PY} cannot import bench/scorer/requirements.txt`); return; }
  const env = { ...process.env, BENCH_SCORE_PYTHON: PY, JUDGE_ROUTE: 'together' };
  delete env.TOGETHER_API_KEY;
  const r = spawnSync('node', ['bench/scripts/score04.mjs', 'no-such-run', '--out', 'no-such-out'], { cwd: ROOT, encoding: 'utf8', env });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /JUDGE_ROUTE=together needs TOGETHER_API_KEY, and it is not set/);
});
