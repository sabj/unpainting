import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveLinePython, linePython } from './line-python.mjs';
import sharp from 'sharp';
import { prepareLineSource } from './linework-plan.mjs';

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

// a fake python: the probe says torch and controlnet_aux are there (or not); the two tools write what the real ones would
function fakeModelPython(dir, model) {
  const py = path.join(dir, 'fake.py'), python = path.join(dir, 'python');
  fs.writeFileSync(py, [
    'import sys, json, os',
    'a = sys.argv[1:]; out = a[a.index("--out") + 1]',
    'if a[0].endswith("sketch-map.py"):',
    '    os.makedirs(out, exist_ok=True); stem = os.path.splitext(os.path.basename(a[1]))[0]',
    '    open(os.path.join(out, stem + ".png"), "w").write("m"); open(os.path.join(out, stem + ".json"), "w").write(json.dumps({"width": 100, "height": 80}))',
    'else:',
    '    open(out + "-lines.json", "w").write(json.dumps({"image": {"w": 100, "h": 80}, "lines": []}))',
    '    print(sys.argv[1].split("/")[-1], a[a.index("--kind") + 1] if "--kind" in a else "ink")',
  ].join('\n'));
  fs.writeFileSync(python, `#!/bin/sh\nif [ "$1" = "-c" ]; then echo '{"python": "3.9.6", "numpy": "2.0.2", "opencv": "4.11.0", "scikit-image": null, "model": ${model}}'; exit 0; fi\nexec python3 "${py}" "$@"\n`);
  fs.chmodSync(python, 0o755);
  fs.mkdirSync(path.join(dir, 'tools/seg'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tools/seg/sketch-map.py'), '#');
  return python;
}

test('--linemodel 1 traces the lineart map and does not cut it against the separator', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-model-plan-')), logs = [];
  try {
    const python = fakeModelPython(dir, 'true');
    await sharp({ create: { width: 100, height: 80, channels: 3, background: '#fff' } }).png().toFile(path.join(dir, 'drawing.png'));
    const f = flags(['--linesource', 'source-ink', '--image', 'drawing.png', '--copylinesmin', '0', '--linemodel', '1', '--copylinesagree', '2', '--copylinesfloor', '0', '--sketchpython', python]);
    const info = await prepareLineSource({ ...f, out: dir, root: dir, inkShare: 0.02, log: s => logs.push(s) });
    assert.equal(info.extractor, 'lineart-models');
    assert.ok(logs.some(l => /lineart models, fused map computed/.test(l)));
    assert.ok(!logs.some(l => /cut and .* dropped against the separator/.test(l)), 'no agreement cut on model lines');
    assert.ok(f.argv.includes('--drawingfile'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('without torch the models are skipped loudly and copy-lines traces the target, or --linemodel strict stops', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-model-plan-')), logs = [];
  try {
    const python = fakeModelPython(dir, 'false');
    await sharp({ create: { width: 100, height: 80, channels: 3, background: '#fff' } }).png().toFile(path.join(dir, 'drawing.png'));
    const f = flags(['--linesource', 'source-ink', '--image', 'drawing.png', '--copylinesmin', '0', '--linemodel', '1', '--sketchpython', python]);
    const info = await prepareLineSource({ ...f, out: dir, root: dir, inkShare: 0.02, log: s => logs.push(s) });
    assert.equal(info.extractor, 'copy-lines');
    assert.ok(logs.some(l => /^!!! line source source-ink: lineart models skipped, .*no torch or controlnet_aux/.test(l)));
    const strict = flags(['--linesource', 'source-ink', '--image', 'drawing.png', '--copylinesmin', '0', '--linemodel', 'strict', '--sketchpython', python]);
    await assert.rejects(prepareLineSource({ ...strict, out: dir, root: dir, inkShare: 0.02, log: () => {} }), /--linemodel strict/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
