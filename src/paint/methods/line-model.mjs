// Inking pipeline, stage 1 (line source): the target's lines from the published lineart models. tools/seg/sketch-map.py
// runs the fine and coarse models and fuses them into one map; tools/seg/copy-lines.py --kind line-map traces the
// fused map into a line file. The map is cached by the target's SHA-256, the map size and the script's own hash.
// Planning only: it reads the target before the first mark.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ENV = { OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' };

/** The cache folder of one target's maps: target hash, map size and the script's version. */
export function lineModelDir({ cacheDir, bytes, script, width, maxside }) {
  return path.join(cacheDir, `${sha(bytes)}-${width}x${maxside}-${sha(script).slice(0, 8)}`);
}

/**
 * The fused lineart map of `image` (a dark-on-white PNG) and its size, from the cache when the same target bytes were
 * mapped by this version of the script at this size, else by running sketch-map.py. Throws when the models cannot run.
 * @returns {{ map, dir, width, height, cached }}
 */
export function lineModelMap({ python, root, image, cacheDir, width = 1080, maxside = 1620, offline = false, weights = path.join(root, 'work/line-models/hf'), run = spawnSync }) {
  const script = path.join(root, 'tools/seg/sketch-map.py');
  const dir = lineModelDir({ cacheDir, bytes: fs.readFileSync(image), script: fs.readFileSync(script), width, maxside });
  const stem = path.basename(image).replace(/\.[^.]+$/, ''), map = path.join(dir, stem + '.png'), meta = path.join(dir, stem + '.json');
  const read = cached => { const m = JSON.parse(fs.readFileSync(meta, 'utf8')); return { map, dir, width: m.width, height: m.height, cached }; };
  if (fs.existsSync(map) && fs.existsSync(meta)) return read(true);
  fs.mkdirSync(dir, { recursive: true });
  const args = [script, image, '--out', dir, '--width', String(width), '--maxside', String(maxside), '--cache', weights, ...(offline ? ['--offline'] : [])];
  const r = run(python, args, { cwd: root, encoding: 'utf8', timeout: 1800000, env: { ...process.env, ...ENV } });
  if (r.error || r.status !== 0 || !fs.existsSync(map) || !fs.existsSync(meta)) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`lineart models failed: ${r.error?.message ?? (String(r.stderr ?? '').trim().split('\n').at(-1) || `exit ${r.status}`)}`);
  }
  return read(false);
}

/**
 * Trace the fused lineart map of `image` into the line file `<stem>-lines.json` (plus its -ink.png and -skeleton.png).
 * The lines are the map's own: nothing here cuts them against the target. With `strokes`, the source's own pen strokes
 * are traced instead (copy-lines.py --kind stroke), gated by the map.
 * @returns {{ map, cached, summary }} summary is copy-lines.py's stage counts line
 */
export function traceLineModel({ python, root, image, stem, cacheDir, width, maxside, tolerance = null, offline = false, weights, strokes = false, run = spawnSync }) {
  const m = lineModelMap({ python, root, image, cacheDir, width, maxside, offline, weights, run });
  // the fine model's own map: its marks in busy detail regions join the mask (copy-lines.py --fine)
  const fine = m.map.replace(/\.png$/, '-fine.png');
  // strokes: the source's own pen strokes (centrelines and widths), kept where the map also sees a line; else the map's contours
  const args = strokes
    ? [path.join(root, 'tools/seg/copy-lines.py'), image, '--out', stem, '--width', String(m.width), '--kind', 'stroke', '--gate', m.map, '--stroke-colour', '10']
    : [path.join(root, 'tools/seg/copy-lines.py'), m.map, '--out', stem, '--width', String(m.width), '--kind', 'line-map', ...(fs.existsSync(fine) ? ['--fine', fine] : [])];
  const r = run(python, [...args, ...(tolerance == null ? [] : ['--map-tolerance', String(tolerance)])],
    { cwd: root, encoding: 'utf8', timeout: 900000, env: { ...process.env, ...ENV } });
  if (r.error || r.status !== 0) throw new Error(`copy-lines on the lineart map failed: ${r.error?.message ?? r.stderr}`);
  // the line file is the target's own: its hash and size, not the map's
  const file = `${stem}-lines.json`, doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...doc, targetSHA256: sha(fs.readFileSync(image)), lineMap: { width: m.width, height: m.height, cached: m.cached } }) + '\n');
  return { map: m.map, cached: m.cached, summary: r.stdout.trim() };
}
