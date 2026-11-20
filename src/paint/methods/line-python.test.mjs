import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveLinePython, linePython } from './line-python.mjs';
import sharp from 'sharp';

const flags = argv => ({ argv, opt: (n, d) => { const i = argv.lastIndexOf('--' + n); return i >= 0 ? argv[i + 1] : d; }, num: (n, d) => Number(flags(argv).opt(n, d)) });
const none = () => false;

test('the line python is --sketchpython, then PAINTER_LINES_PYTHON, then PAINTER_LINES_VENV, then the repo venv, then python3', () => {
  const venv = p => p === '/r/.venv-lines/bin/python';
  assert.deepEqual(resolveLinePython({ flag: '/x/python', env: { PAINTER_LINES_PYTHON: '/y/python' }, root: '/r', exists: venv }), { path: '/x/python', from: '--sketchpython' });
  assert.deepEqual(resolveLinePython({ env: { PAINTER_LINES_PYTHON: '/y/python' }, root: '/r', exists: venv }), { path: '/y/python', from: 'PAINTER_LINES_PYTHON' });
  assert.deepEqual(resolveLinePython({ env: {}, root: '/r', exists: venv }), { path: '/r/.venv-lines/bin/python', from: '.venv-lines' });
  const both = p => p === '/v/bin/python' || venv(p);
  assert.deepEqual(resolveLinePython({ env: { PAINTER_LINES_VENV: '/v' }, root: '/r', exists: both }), { path: '/v/bin/python', from: 'PAINTER_LINES_VENV' });
  assert.deepEqual(resolveLinePython({ env: { PAINTER_LINES_VENV: '/missing' }, root: '/r', exists: venv }), { path: '/r/.venv-lines/bin/python', from: '.venv-lines' });
  const last = resolveLinePython({ env: {}, root: '/r', exists: none });
  assert.equal(last.path, 'python3');
  assert.match(last.fallback, /PAINTER_LINES_PYTHON unset/);
});

test('the line python is logged with its versions, and a fallback is shouted once', () => {
  const logs = [], warns = [], warned = new Set();
  const run = () => ({ status: 3, stdout: '{"python": "3.9.6", "numpy": null, "opencv": null, "scikit-image": null}\n', stderr: '' });
  for (let i = 0; i < 2; i++) linePython({ env: {}, root: '/nowhere', exists: none, run, log: s => logs.push(s), warn: s => warns.push(s), warned });
  assert.match(logs[0], /line python: python3 \(python3\): python 3\.9\.6, numpy missing, OpenCV missing/);
  assert.equal(warns.length, 2, 'one line for the fallback, one for the missing packages, each once');
  assert(warns.every(w => w.startsWith('!!! line python')));
  const ok = linePython({ env: { PAINTER_LINES_PYTHON: '/v/python' }, run: () => ({ status: 0, stdout: '{"python": "3.9.6", "numpy": "2.0.2", "opencv": "4.11.0", "scikit-image": "0.24.0"}\n' }), log: () => {}, warn: s => warns.push(s), warned });
  assert.equal(ok.ready, true);
  assert.equal(ok.opencv, '4.11.0');
  assert.equal(warns.length, 2, 'a ready python warns nothing');
});
