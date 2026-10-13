// Which python runs the line tools (tools/seg/*.py). They need numpy and OpenCV, and use scikit-image when present,
// which the system python3 usually lacks. Without them every automatic line source falls back to the narrow-ridge
// tracer or the walker, so the choice is made in one place, logged with its package versions, and recorded in
// linework.json.
//
// Order: --sketchpython, else PAINTER_LINES_PYTHON, else an existing ~/painter-lines or /opt/painter-lines venv
// (tools/cloud/setup-lines.sh installs either), else python3. Falling back to python3, or to a python without numpy
// and OpenCV, is logged loudly once per process.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const LINE_VENVS = Object.freeze(['~/painter-lines', '/opt/painter-lines']);
// exits 0 only when numpy and OpenCV import; prints the versions it found either way
const PROBE = [
  'import json, sys',
  'v = {"python": sys.version.split()[0]}',
  'for mod, name in (("numpy", "numpy"), ("cv2", "opencv"), ("skimage", "scikit-image")):',
  '    try: v[name] = __import__(mod).__version__',
  '    except Exception: v[name] = None',
  'print(json.dumps(v))',
  'sys.exit(0 if v["numpy"] and v["opencv"] else 3)',
].join('\n');
const PROBES = new Map();
const WARNED = new Set();

/** The python the line tools should use and where the choice came from. Pure: env, home and exists are injectable. */
export function resolveLinePython({ flag = '', env = process.env, home = os.homedir(), exists = fs.existsSync } = {}) {
  if (flag) return { path: flag, from: '--sketchpython' };
  if (env.PAINTER_LINES_PYTHON) return { path: env.PAINTER_LINES_PYTHON, from: 'PAINTER_LINES_PYTHON' };
  for (const dir of LINE_VENVS) {
    const p = path.join(dir.replace(/^~(?=\/)/, home), 'bin', 'python');
    if (exists(p)) return { path: p, from: dir };
  }
  return { path: 'python3', from: 'python3', fallback: `no --sketchpython, PAINTER_LINES_PYTHON unset, and no ${LINE_VENVS.join(' or ')}` };
}

function probe(python, run) {
  // a probe through an injected runner (tests) is never cached
  const cache = run === spawnSync ? PROBES : new Map();
  if (cache.has(python)) return cache.get(python);
  const r = run(python, ['-c', PROBE], { encoding: 'utf8', timeout: 60000 });
  let v = {};
  try { v = JSON.parse(String(r.stdout ?? '').trim().split('\n').at(-1)); } catch { v = {}; }
  const out = {
    ready: !r.error && r.status === 0,
    python: v.python ?? null, numpy: v.numpy ?? null, opencv: v.opencv ?? null, 'scikit-image': v['scikit-image'] ?? null,
    ...(r.error || r.status !== 0 ? { error: r.error?.message ?? (String(r.stderr ?? '').trim().split('\n').at(-1) || `exit ${r.status}`) } : {}),
  };
  cache.set(python, out);
  return out;
}

const loud = (warn, warned, key, text) => { if (warned.has(key)) return; warned.add(key); warn(`!!! line python: ${text}`); };

/**
 * The resolved line python with its versions, logged. `ready` says whether numpy and OpenCV import.
 * @returns {{ path, from, ready, python, numpy, opencv, 'scikit-image', fallback?, error? }}
 */
export function linePython({ flag = '', env = process.env, home = os.homedir(), exists = fs.existsSync, run = spawnSync, log = console.log, warn = console.warn, warned = WARNED } = {}) {
  const choice = resolveLinePython({ flag, env, home, exists });
  const rec = { ...choice, ...probe(choice.path, run) };
  const ver = k => rec[k] ?? 'missing';
  log(`line python: ${rec.path} (${rec.from}): python ${rec.python ?? 'unknown'}, numpy ${ver('numpy')}, OpenCV ${ver('opencv')}, scikit-image ${ver('scikit-image')}`);
  if (choice.fallback) loud(warn, warned, 'fallback', `falling back to python3: ${choice.fallback}. Run tools/cloud/setup-lines.sh or set PAINTER_LINES_PYTHON.`);
  if (!rec.ready) loud(warn, warned, 'missing:' + rec.path, `${rec.path} cannot import numpy and OpenCV (${rec.error}); automatic line sources fall back to the narrow-ridge tracer or the walker.`);
  return rec;
}
