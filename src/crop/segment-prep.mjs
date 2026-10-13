// Segmentation before every painting. The target's region map (tools/seg/segments.py --mode regions) is looked up in
// a cache keyed by the target's SHA-256 and made when it is missing. It is then registered under the target's own
// name (registerSegments in segments.mjs), so every segment reader in the painter finds it, even when two targets share
// a file name such as target.png. Each run logs the backend that made the map (SAM or k-means) and its region count.
//
// Flags:
//   --segments sam|kmeans|off  sam (default): Segment Anything must run; a run without it fails, it never falls back
//                              to k-means. kmeans: Lab clusters only. off: no segments, and the log says so.
//   --segpython <path>         a python with numpy, opencv, torch and segment_anything; else $PAINTER_SEG_PYTHON,
//                              else the repo's .venv-seg, else ~/painter-strategy/.venv-seg, else the repo's .venv
//   --samcheckpoint <path>     the SAM vit_b checkpoint; else $PAINTER_SAM_CHECKPOINT, else
//                              ~/painter-models/sam_vit_b_01ec64.pth, else work/models/sam_vit_b_01ec64.pth
//   --segcache <dir>           where the maps are kept (default work/segments/by-hash)
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerSegments } from './segments.mjs';

const BACKENDS = Object.freeze(['sam', 'kmeans', 'off']);
const CHECKPOINT = 'sam_vit_b_01ec64.pth';
const SCRIPTS = Object.freeze(['tools/seg/segments.py', 'tools/seg/sam_regions.py']);
// SAM on a 1024 px image takes about 20 s on an M4 GPU and minutes on a CPU.
const TIMEOUT_MS = 30 * 60 * 1000;

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** The first path that exists, or null. */
const firstExisting = paths => paths.find(p => p && fs.existsSync(p)) ?? null;

/** The python that runs segments.py: an explicit choice must exist; otherwise the first known venv that does. */
export function resolveSegPython({ given = '', env = process.env, root, home = os.homedir() }) {
  if (given) {
    if (!fs.existsSync(given)) throw new Error(`segments: --segpython ${given} does not exist`);
    return given;
  }
  if (env.PAINTER_SEG_PYTHON) {
    if (!fs.existsSync(env.PAINTER_SEG_PYTHON)) throw new Error(`segments: PAINTER_SEG_PYTHON ${env.PAINTER_SEG_PYTHON} does not exist`);
    return env.PAINTER_SEG_PYTHON;
  }
  return firstExisting([
    path.join(root, '.venv-seg', 'bin', 'python'),
    path.join(home, 'painter-strategy', '.venv-seg', 'bin', 'python'),
    path.join(root, '.venv', 'bin', 'python'),
  ]);
}

/** The SAM checkpoint: an explicit choice must exist; otherwise the first known place that holds one. */
export function resolveSamCheckpoint({ given = '', env = process.env, root, home = os.homedir() }) {
  if (given) {
    if (!fs.existsSync(given)) throw new Error(`segments: --samcheckpoint ${given} does not exist`);
    return given;
  }
  if (env.PAINTER_SAM_CHECKPOINT) {
    if (!fs.existsSync(env.PAINTER_SAM_CHECKPOINT)) throw new Error(`segments: PAINTER_SAM_CHECKPOINT ${env.PAINTER_SAM_CHECKPOINT} does not exist`);
    return env.PAINTER_SAM_CHECKPOINT;
  }
  return firstExisting([path.join(home, 'painter-models', CHECKPOINT), path.join(root, 'work', 'models', CHECKPOINT)]);
}

/** The cache name: the target's bytes, the backend and the segmentation code, so a changed script makes a new map. */
export function segmentKey({ image, backend, root }) {
  const code = sha(Buffer.concat(SCRIPTS.map(s => fs.readFileSync(path.join(root, s)))));
  return `${sha(fs.readFileSync(image)).slice(0, 16)}-${backend}-${code.slice(0, 8)}`;
}

/** The log line for a map: backend, region count and where it came from. */
export function describeSegments(doc, { cached, seconds }) {
  const b = doc.backend ?? {};
  const how = b.backend === 'sam' ? `SAM ${b.model} on ${b.device} (${b.masks} masks, ${b.laid} laid)` : `k-means in Lab (k ${b.k})`;
  const fg = (doc.regions ?? []).filter(r => r.foreground).length;
  const when = cached ? 'from the cache' : `made in ${seconds.toFixed(1)} s`;
  return `segments: ${how}, ${doc.regions?.length ?? 0} regions, ${fg} inside the frame; ${when}`;
}

function runSegments({ python, image, backend, checkpoint, root, stem }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'painter-seg-'));
  try {
    const args = [path.join(root, SCRIPTS[0]), image, '--mode', 'regions', '--out', tmp,
      '--sam', backend === 'sam' ? 'require' : 'off', ...(checkpoint ? ['--checkpoint', checkpoint] : [])];
    try {
      execFileSync(python, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: TIMEOUT_MS });
    } catch (e) {
      const why = String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-3).join(' | ');
      throw new Error(`segments: ${python} ${SCRIPTS[0]} failed: ${why}`);
    }
    const base = path.basename(image, path.extname(image));
    fs.mkdirSync(path.dirname(stem), { recursive: true });
    for (const [from, to] of [[`${base}.png`, '.png'], [`${base}.json`, '.json'], [`${base}-contours.json`, '-contours.json']]) {
      fs.copyFileSync(path.join(tmp, from), stem + to);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Finds or makes the target's region map and registers it, and records what it did in <out>/segments.json. Returns
 * null under --segments off, else { stem, backend, regions, foreground, cached, seconds }. Throws when the backend
 * asked for cannot run.
 */
export function prepareSegments({ image, root, out = null, opt, log, env = process.env, home = os.homedir() }) {
  const backend = opt('segments', 'sam');
  if (!BACKENDS.includes(backend)) throw new Error(`--segments: one of ${BACKENDS.join(', ')}, not ${backend}`);
  if (backend === 'off') { log('segments: off (--segments off); every segment-aware step cuts by colour and value alone'); return null; }
  const python = resolveSegPython({ given: opt('segpython', ''), env, root, home });
  if (!python) throw new Error('segments: no python for tools/seg/segments.py; pass --segpython or set PAINTER_SEG_PYTHON (or --segments off)');
  const checkpoint = backend === 'sam' ? resolveSamCheckpoint({ given: opt('samcheckpoint', ''), env, root, home }) : null;
  if (backend === 'sam' && !checkpoint) {
    throw new Error(`segments: SAM is required and no ${CHECKPOINT} was found; pass --samcheckpoint or set PAINTER_SAM_CHECKPOINT (or --segments kmeans)`);
  }
  const stem = path.join(path.resolve(root, opt('segcache', path.join('work', 'segments', 'by-hash'))), segmentKey({ image, backend, root }));
  const cached = fs.existsSync(`${stem}.png`) && fs.existsSync(`${stem}.json`);
  const started = performance.now();
  if (!cached) runSegments({ python, image, backend, checkpoint, root, stem });
  const seconds = (performance.now() - started) / 1000;
  const doc = JSON.parse(fs.readFileSync(`${stem}.json`, 'utf8'));
  const made = doc.backend?.backend;
  if (made !== backend) throw new Error(`segments: asked for ${backend}, the map at ${stem}.json was made by ${made ?? 'nothing named'}`);
  if (!doc.regions?.length) throw new Error(`segments: the map at ${stem}.json has no regions`);
  registerSegments(path.basename(image, path.extname(image)), stem);
  log(describeSegments(doc, { cached, seconds }));
  const record = { stem, backend: made, model: doc.backend, regions: doc.regions.length, foreground: doc.regions.filter(r => r.foreground).length, cached, seconds: +seconds.toFixed(2) };
  if (out) fs.writeFileSync(path.join(out, 'segments.json'), JSON.stringify(record, null, 2));
  return record;
}
