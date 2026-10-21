// Which python runs the line tools (tools/seg/*.py). They need numpy and OpenCV, and use scikit-image when present,
// which the system python3 usually lacks. Without them every automatic line source falls back to the narrow-ridge
// tracer or the walker, so the choice is made in one place, logged with its package versions, and recorded in
// linework.json.
//
// Order: --sketchpython, else PAINTER_LINES_PYTHON, else PAINTER_LINES_VENV/bin/python, else the repo's
// .venv-lines/bin/python (tools/cloud/setup-lines.sh installs it there by default), else python3. Falling back to
// python3, or to a python without numpy and OpenCV, is logged loudly once per process.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REPO_VENV = '.venv-lines';
// exits 0 only when numpy and OpenCV import; prints the versions it found either way, and whether torch and controlnet_aux
// (the lineart models of tools/seg/sketch-map.py) are installed
const PROBE = [
  'import json, sys',
  'v = {"python": sys.version.split()[0]}',
  'for mod, name in (("numpy", "numpy"), ("cv2", "opencv"), ("skimage", "scikit-image")):',
  '    try: v[name] = __import__(mod).__version__',
  '    except Exception: v[name] = None',
  'import importlib.util as u',
  'v["model"] = all(u.find_spec(m) is not None for m in ("torch", "controlnet_aux"))',
  'print(json.dumps(v))',
  'sys.exit(0 if v["numpy"] and v["opencv"] else 3)',
].join('\n');
const PROBES = new Map();
const WARNED = new Set();

/** The python the line tools should use and where the choice came from. Pure: env, root and exists are injectable. */
export function resolveLinePython({ flag = '', env = process.env, root = REPO_ROOT, exists = fs.existsSync } = {}) {
  if (flag) return { path: flag, from: '--sketchpython' };
  if (env.PAINTER_LINES_PYTHON) return { path: env.PAINTER_LINES_PYTHON, from: 'PAINTER_LINES_PYTHON' };
  const venvs = [...(env.PAINTER_LINES_VENV ? [[env.PAINTER_LINES_VENV, 'PAINTER_LINES_VENV']] : []), [path.join(root, REPO_VENV), REPO_VENV]];
  for (const [dir, from] of venvs) {
    const p = path.join(dir, 'bin', 'python');
    if (exists(p)) return { path: p, from };
  }
  return { path: 'python3', from: 'python3', fallback: `no --sketchpython, PAINTER_LINES_PYTHON unset, and no ${venvs.map(v => v[1]).join(' or ')} venv` };
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
    model: v.model === true,
    python: v.python ?? null, numpy: v.numpy ?? null, opencv: v.opencv ?? null, 'scikit-image': v['scikit-image'] ?? null,
    ...(r.error || r.status !== 0 ? { error: r.error?.message ?? (String(r.stderr ?? '').trim().split('\n').at(-1) || `exit ${r.status}`) } : {}),
  };
  cache.set(python, out);
  return out;
}

const loud = (warn, warned, key, text) => { if (warned.has(key)) return; warned.add(key); warn(`!!! line python: ${text}`); };

/**
 * The resolved line python with its versions, logged. `ready` says whether numpy and OpenCV import, `model` whether the
 * lineart models' packages (torch, controlnet_aux) are installed.
 * @returns {{ path, from, ready, model, python, numpy, opencv, 'scikit-image', fallback?, error? }}
 */
export function linePython({ flag = '', env = process.env, root = REPO_ROOT, exists = fs.existsSync, run = spawnSync, log = console.log, warn = console.warn, warned = WARNED } = {}) {
  const choice = resolveLinePython({ flag, env, root, exists });
  const rec = { ...choice, ...probe(choice.path, run) };
  const ver = k => rec[k] ?? 'missing';
  log(`line python: ${rec.path} (${rec.from}): python ${rec.python ?? 'unknown'}, numpy ${ver('numpy')}, OpenCV ${ver('opencv')}, scikit-image ${ver('scikit-image')}`);
  if (choice.fallback) loud(warn, warned, 'fallback', `falling back to python3: ${choice.fallback}. Run tools/cloud/setup-lines.sh or set PAINTER_LINES_PYTHON.`);
  if (!rec.ready) loud(warn, warned, 'missing:' + rec.path, `${rec.path} cannot import numpy and OpenCV (${rec.error}); automatic line sources fall back to the narrow-ridge tracer or the walker.`);
  return rec;
}
