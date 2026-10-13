import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveLinePython, linePython } from './line-python.mjs';
import { prepareLineSource } from './linework-plan.mjs';

const flags = argv => ({ argv, opt: (n, d) => { const i = argv.lastIndexOf('--' + n); return i >= 0 ? argv[i + 1] : d; }, num: (n, d) => Number(flags(argv).opt(n, d)) });
const none = () => false;

test('the line python is --sketchpython, then PAINTER_LINES_PYTHON, then a line-tools venv, then python3', () => {
  const venv = p => p === '/home/u/painter-lines/bin/python';
  assert.deepEqual(resolveLinePython({ flag: '/x/python', env: { PAINTER_LINES_PYTHON: '/y/python' }, home: '/home/u', exists: venv }), { path: '/x/python', from: '--sketchpython' });
  assert.deepEqual(resolveLinePython({ env: { PAINTER_LINES_PYTHON: '/y/python' }, home: '/home/u', exists: venv }), { path: '/y/python', from: 'PAINTER_LINES_PYTHON' });
  assert.deepEqual(resolveLinePython({ env: {}, home: '/home/u', exists: venv }), { path: '/home/u/painter-lines/bin/python', from: '~/painter-lines' });
  assert.deepEqual(resolveLinePython({ env: {}, home: '/home/u', exists: p => p === '/opt/painter-lines/bin/python' }), { path: '/opt/painter-lines/bin/python', from: '/opt/painter-lines' });
  const last = resolveLinePython({ env: {}, home: '/home/u', exists: none });
  assert.equal(last.path, 'python3');
  assert.match(last.fallback, /PAINTER_LINES_PYTHON unset/);
});

test('the line python is logged with its versions, and a fallback is shouted once', () => {
  const logs = [], warns = [], warned = new Set();
  const run = () => ({ status: 3, stdout: '{"python": "3.9.6", "numpy": null, "opencv": null, "scikit-image": null}\n', stderr: '' });
  for (let i = 0; i < 2; i++) linePython({ env: {}, home: '/nowhere', exists: none, run, log: s => logs.push(s), warn: s => warns.push(s), warned });
  assert.match(logs[0], /line python: python3 \(python3\): python 3\.9\.6, numpy missing, OpenCV missing/);
  assert.equal(warns.length, 2, 'one line for the fallback, one for the missing packages, each once');
  assert(warns.every(w => w.startsWith('!!! line python')));
  const ok = linePython({ env: { PAINTER_LINES_PYTHON: '/v/python' }, run: () => ({ status: 0, stdout: '{"python": "3.9.6", "numpy": "2.0.2", "opencv": "4.11.0", "scikit-image": "0.24.0"}\n' }), log: () => {}, warn: s => warns.push(s), warned });
  assert.equal(ok.ready, true);
  assert.equal(ok.opencv, '4.11.0');
  assert.equal(warns.length, 2, 'a ready python warns nothing');
});

test('source-ink uses PAINTER_LINES_PYTHON without --sketchpython and records it in linework', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-python-'));
  const saved = process.env.PAINTER_LINES_PYTHON;
  try {
    const python = path.join(dir, 'python');
    fs.writeFileSync(python, '#!/bin/sh\nif [ "$1" = "-c" ]; then echo \'{"python": "3.9.6", "numpy": "2.0.2", "opencv": "4.11.0", "scikit-image": "0.24.0"}\'; exit 0; fi\nprintf "%s\\n" "$@" > "' + dir + '/called"\n');
    fs.chmodSync(python, 0o755);
    process.env.PAINTER_LINES_PYTHON = python;
    const f = flags(['--linesource', 'source-ink', '--image', 'drawing.png', '--width', '720']);
    const info = await prepareLineSource({ ...f, out: dir, root: dir, inkShare: 0.02 });
    assert.equal(info.extractor, 'copy-lines');
    assert.match(fs.readFileSync(path.join(dir, 'called'), 'utf8'), /copy-lines\.py/);
    assert.equal(info.python.path, python);
    assert.equal(info.python.from, 'PAINTER_LINES_PYTHON');
    assert.equal(info.python.numpy, '2.0.2');
  } finally {
    if (saved === undefined) delete process.env.PAINTER_LINES_PYTHON; else process.env.PAINTER_LINES_PYTHON = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
