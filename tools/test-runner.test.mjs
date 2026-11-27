import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runner = fileURLToPath(new URL('./test-runner.mjs', import.meta.url));
for (const suite of ['source', 'bench']) test(`${suite} test launcher lets Node parse appended npm options`, t => {
  // A trailing --help used to be ignored and start the entire suite. Node must
  // handle it as an option, before discovering or running any tests.
  // If the ordering regresses, an empty cwd prevents this probe from starting
  // the real suite recursively while checking the failure.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'test-launcher-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [runner, suite, '--help'], { cwd, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: node/);
  assert.match(result.stdout, /--test-concurrency/);
  assert.doesNotMatch(result.stdout, /# Subtest:|# tests \d+/);
});

test('test launcher rejects an unknown suite before starting Node tests', () => {
  const result = spawnSync(process.execPath, [runner, 'unknown'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /choose source or bench/);
  assert.equal(result.stdout, '');
});
