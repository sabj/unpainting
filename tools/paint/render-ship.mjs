// What a painting sent to another machine takes with it, and how its command reads there (render-pool.mjs). Every
// input the painter reads is named in its arguments by an absolute path (the subject, its studies, the drawing's stem,
// the script, the plan file, the named forms); those files go to the worker under one folder that mirrors this Mac's
// paths, so each path in the arguments is that folder's name put in front of it, and the painter's own records name
// them back the other way when they come home. Pure but for the file listing a caller passes in.
import path from 'node:path';

const PATH = /(?<![\w.~])\/[^\s,:'"]+/g;
/** The painter's arguments that name what it writes, not what it reads. */
const OUTPUTS = new Set(['--out', '--pausedir']);

/** Every absolute path named in `args`, with the option it is given to, outputs left out. [{file, flag}] */
export function namedPaths(args) {
  const out = [];
  args.forEach((a, i) => {
    const flag = i > 0 && String(args[i - 1]).startsWith('--') ? args[i - 1] : null;
    if (OUTPUTS.has(flag) || String(a).startsWith('--')) return;
    for (const m of String(a).matchAll(PATH)) out.push({ file: m[0].replace(/\/+$/, ''), flag });
  });
  return out;
}

/**
 * The files and folders to send for a painter's arguments, absolute, sorted, none inside another. A path that is a
 * file is sent; a folder whole; the named forms' receipt with its folder (the receipt names its mask and labels
 * beside it); a path that is neither is a stem (a drawing: <stem>-lines.json, <stem>-vectors.json) and every file
 * of its folder named <stem>-* or <stem>.* is sent. A stem with no such file throws: nothing is sent half.
 * `see(file)`: 'file' | 'dir' | null; `list(dir)`: the names in a folder.
 */
export function jobInputs(args, { see, list }) {
  const want = new Set();
  for (const { file, flag } of namedPaths(args)) {
    const kind = see(file);
    if (kind === 'dir') want.add(file);
    else if (kind === 'file') want.add(flag === '--thingmasks' ? path.dirname(file) : file);
    else {
      const dir = path.dirname(file), stem = path.basename(file);
      const found = see(dir) === 'dir' ? list(dir).filter(n => n.startsWith(`${stem}-`) || n.startsWith(`${stem}.`)) : [];
      if (!found.length) throw new Error(`${flag ?? 'an argument'} ${file}: no such file or stem on this Mac, so the painting cannot be sent to a worker`);
      for (const n of found) want.add(path.join(dir, n));
    }
  }
  const all = [...want].sort();
  return all.filter(f => !all.some(d => d !== f && f.startsWith(d + '/')));
}

/**
 * The arguments as they read on the worker: the --out folder is the job's own `out`, a --pausedir is left to the
 * worker, and every other absolute path has `root` (the worker's mirror of this Mac's files) in front of it.
 */
export function workerArgs(args, { root, out }) {
  const res = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pausedir') throw new Error('a painting sent to a worker is stopped at a stage by the worker itself (render-worker.mjs), not by a --pausedir of this Mac');
    if (args[i] === '--out') { res.push('--out', out); i++; continue; }
    res.push(String(args[i]).startsWith('--') ? args[i] : String(args[i]).replace(PATH, m => root + m));
  }
  return res;
}

/** Text the painter wrote on the worker, with this Mac's paths in it again (the job's out folder, then the mirror). */
export const homePaths = (text, { root, out, localOut }) => text.split(out).join(localOut).split(root + '/').join('/');

/** Environment names that name a machine's own files: each worker sets its own. */
const MACHINE_ENV = new Set(['PAINTER_SEG_PYTHON', 'PAINTER_SAM_CHECKPOINT', 'PAINTER_LINES_VENV', 'PAINTER_SEG_VENV', 'W2_CACHE_DIR']);
/** Prefixes of the environment that change what the painter does (experiment switches, GPU and layer settings). */
const PAINTER_ENV = /^(X|GPU|KM|LAYER|PAINT|PAINTER|DRY)_[A-Z0-9_]+$/;

/**
 * The painter's environment on a worker: what the command and this Mac's shell set that changes the painting, never
 * a path of this Mac's, then the worker's own (its Python, checkpoint and cache). The cache folder keeps its name
 * (run.mjs cacheDirFor: one a set of switches) under the worker's cache.
 */
export function workerEnv(commandEnv, shellEnv, { own = {}, cache }) {
  const env = {};
  for (const [k, v] of [...Object.entries(shellEnv), ...Object.entries(commandEnv)]) if (PAINTER_ENV.test(k) && !MACHINE_ENV.has(k)) env[k] = v;
  return { ...env, ...own, W2_CACHE_DIR: path.posix.join(cache, path.basename(commandEnv.W2_CACHE_DIR ?? 'paint-plain')) };
}
