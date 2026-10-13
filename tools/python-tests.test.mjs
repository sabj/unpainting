// The Python line-tool tests (tools/seg/*-test.py, tools/judge/*-test.py) run under npm test, with the python the
// painter itself uses for line work (src/paint/methods/line-python.mjs). Without numpy and OpenCV each one is reported
// as skipped, never as passed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { linePython } from '../src/paint/methods/line-python.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['tools/seg', 'tools/judge'].flatMap(d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('-test.py')).map(f => path.join(d, f))).sort();
const PY = linePython({ log: () => {}, warn: () => {} });

test('the Python line-tool tests are found', () => assert.ok(FILES.length >= 5, FILES.join(', ')));

for (const file of FILES) {
  test(`python ${file}`, { timeout: 300000 }, t => {
    if (!PY.ready) { t.skip(`${PY.path} cannot import numpy and OpenCV; run tools/cloud/setup-lines.sh`); return; }
    const r = spawnSync(PY.path, ['-B', file], { cwd: ROOT, encoding: 'utf8', timeout: 290000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' } });
    assert.equal(r.status, 0, `${file} failed under ${PY.path}:\n${(r.stderr || r.error?.message || '').slice(-2000)}`);
    assert.match(r.stderr, /Ran [1-9]\d* tests? in [\d.]+s\n+OK/, 'unittest ran tests and reported success');
  });
}
