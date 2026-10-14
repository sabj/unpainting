// Target guard: the paint step gets no cell-level handle to the target picture.
//
// Planning may read the reference the way a painter does: values, regions, a palette from the box, and a mix per stroke
// chosen from the target under the stroke's footprint. Once the first mark goes down, nothing may read the target's
// pixels or any per-cell map computed from them: no colour sampled per stroke while painting, no "lay more where the
// sheet is still lighter than the target", no keep-if-closer loops.
//
// The painter may still look. A look (guard.look) returns the mean of the reference and the mean of the painter's own
// sheet over a whole shape, never one cell. Peeks and between-pass reviews are looks too, and they never trip the guard.
//
// Modes:
//   gentle  the default. Unlimited looks. Cell-level reads of the target while painting are blocked and recorded.
//   hard    gentle plus a budget of looks per painting (HARD_LOOK_BUDGET unless lookBudget says otherwise). A look past
//           the budget returns nothing and is counted.
//   warn    records cell-level reads but does not block them. For diagnosis only; the run is not 'painted'.
//   off     no guard.
//   strict  the hard mode. Run cards and scripts ask for strict, so it must mean the strictest blocking mode.
//
//   const guard = createTargetGuard({ mode: 'gentle', targetPaths: [file] });
//   let px = guard.register('px', pxRaw);       // plan freely
//   guard.provide('px', pxRaw, { stride: 3 });  // the maps a look may average
//   guard.beginPaint();                         // from here on:
//   px = guard.seal('px', px);                  //   any element read of px throws (gentle, hard) or is logged (warn)
//   guard.look('review', 'pass 2', mask, ...)   //   shape-level means are always allowed
//   guard.endPaint();                           // painting finished: reading target.jpg for scoring is fine again
//
// fs and sharp reads of the target files are blocked (gentle, hard) or logged (warn) while painting.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const MODES = ['off', 'warn', 'gentle', 'hard'];
export const MODE_ALIASES = { strict: 'hard' };
export const DEFAULT_MODE = 'gentle';
export const HARD_LOOK_BUDGET = 2500;
// names that, in this codebase, hold the target or a per-cell map computed from it
export const TARGET_NAMES = ['px', 'rgb', 'target', 'targetRGB', 'source', 'SRC', 'D_SOURCE', 'D_AIM', 'D_PLAN', 'A', 'AL', 'SRC_LAB', 'SRC_D', 'WANT', 'G'];
// Where a look may happen. Each returns shape means only.
//   peek     inspect the target or painting at any time
//   review   a shape-level check-in between passes
//   passage  before a passage is charged: how much of its plan the sheet already holds
//   texture  before a textured passage: how dark the shape reads, for its mark density
export const LOOK_CHECKPOINTS = ['peek', 'review', 'passage', 'texture'];
// A shape under LOOK_MIN_CELLS cells is too small to squint at and gets nothing back, so a look cannot be narrowed into
// a per-pixel probe.
export const LOOK_MIN_CELLS = 64;
// painted: guarded, no cell-level target read while painting. copied: a cell-level read happened (warn mode lets the run
// go on so it can be diagnosed). unguarded: the guard was off.
export const CATEGORIES = ['painted', 'copied', 'unguarded'];

export class TargetGuardError extends Error {
  constructor(message, record) { super(message); this.name = 'TargetGuardError'; this.record = record; }
}

/** The mode a flag value names, with 'strict' read as 'hard'. Throws on anything else. */
export function normalizeMode(mode = DEFAULT_MODE) {
  const m = MODE_ALIASES[mode] ?? mode;
  if (!MODES.includes(m)) throw new Error(`target guard mode must be one of ${MODES.join(', ')} (or strict, another name for hard), got ${mode}`);
  return m;
}

const IMAGE = /\.(png|jpe?g|webp|gif|tiff?|bmp|heic|avif)$/i;
let HOOKED = null; // the one guard whose file checks the process-wide fs/sharp hooks call
/** The guard that is painting now, if any (for the deliberate-cheat test, tools/guard/cheat-test.mjs). */
export const activeGuard = () => HOOKED;

function callerLine() {
  const lines = String(new Error().stack).split('\n').slice(3);
  const own = lines.find(l => !l.includes('no-target.mjs'));
  return own ? own.trim().replace(/^at /, '') : '';
}

export function createTargetGuard({ mode = DEFAULT_MODE, targetPaths = [], log = null, names = TARGET_NAMES, lookBudget = null } = {}) {
  const requested = mode;
  mode = normalizeMode(mode);
  const blocking = mode === 'gentle' || mode === 'hard';
  if (lookBudget != null && !(Number.isInteger(lookBudget) && lookBudget > 0)) throw new Error(`target guard: look budget must be a positive whole number, got ${lookBudget}`);
  const budget = mode === 'hard' ? (lookBudget ?? HARD_LOOK_BUDGET) : null;
  const targets = new Set(targetPaths.filter(Boolean).map(p => path.resolve(p)));
  const registered = new WeakMap(); // array -> name
  const violations = [];
  const seen = new Set();
  const reads = {}; // element reads while painting, per sealed name (warn mode keeps counting past the first record)
  const lookable = new Map(); // name -> { arr, stride }: the raw reference maps a look may average, given before painting
  const looks = { count: 0, cells: 0, refused: 0, overBudget: 0, byCheckpoint: {}, entries: [] };
  let phase = 'plan';

  const record = (kind, name, detail = '') => {
    const where = callerLine();
    const rec = { kind, name, detail, where, phase, blocked: blocking, t: Date.now() };
    const key = `${kind}|${name}|${where}`;
    if (!seen.has(key)) {
      seen.add(key);
      violations.push(rec);
      if (log) { try { fs.appendFileSync(log, JSON.stringify(rec) + '\n'); } catch (e) { console.error(`target guard: could not append to ${log}: ${e.message}`); } }
    }
    if (blocking) throw new TargetGuardError(`target guard (${mode}): blocked ${kind} of ${name} while painting${detail ? ` (${detail})` : ''} at ${where}`, rec);
  };

  const isTargetFile = p => {
    if (p == null) return false;
    let s; try { s = p instanceof URL ? p.pathname : Buffer.isBuffer(p) ? p.toString() : typeof p === 'string' ? p : null; } catch { s = null; }
    if (!s || !IMAGE.test(s)) return false;
    const abs = path.resolve(s);
    if (targets.has(abs)) return true;
    try { return targets.has(fs.realpathSync.native(s)); } catch { return false; }
  };

  const guard = {
    get mode() { return mode; },
    get phase() { return phase; },
    get blocking() { return blocking; },
    get lookBudget() { return budget; },
    get violations() { return violations.slice(); },
    register(name, arr) { if (arr && typeof arr === 'object') registered.set(arr, name); return arr; },
    beginPaint() { phase = 'paint'; if (mode !== 'off') HOOKED = guard; },
    endPaint() { phase = 'done'; if (HOOKED === guard) HOOKED = null; },
    checkFile(p, via) { if (mode !== 'off' && phase === 'paint' && isTargetFile(p)) record('file read', String(p), via); },
    /** A view of `arr` that refuses element reads while painting. Methods and length pass through. */
    seal(name, arr) {
      if (mode === 'off' || arr == null || typeof arr !== 'object') return arr;
      registered.set(arr, name);
      return new Proxy(arr, {
        get(t, k) {
          if (phase === 'paint' && typeof k === 'string' && k.length && k.charCodeAt(0) >= 48 && k.charCodeAt(0) <= 57) {
            reads[name] = (reads[name] || 0) + 1;
            if (reads[name] === 1 || blocking) record('element read', name);
          }
          const v = Reflect.get(t, k, t);
          return typeof v === 'function' ? v.bind(t) : v;
        },
        set(t, k, v) { return Reflect.set(t, k, v, t); },
      });
    },
    /** Blocks (gentle, hard) or logs (warn) when an executor's context carries the target or a registered target map. */
    assertCleanContext(label, ctx) {
      if (mode === 'off' || !ctx || typeof ctx !== 'object') return;
      for (const [k, v] of Object.entries(ctx)) {
        if (v == null) continue;
        const hit = (typeof v === 'object' && registered.has(v)) ? registered.get(v) : names.includes(k) && ArrayBuffer.isView(v) ? k : null;
        if (hit) record('handed to executor', hit, `${label}.${k}`);
      }
    },
    /** Give a reference map to the look before painting starts. `stride` is the channels per cell (3 for RGB, K for a plan). */
    provide(name, arr, { stride = 1 } = {}) {
      if (phase !== 'plan') throw new Error(`target guard: ${name} must be provided to the look before painting`);
      if (!arr || !Number.isInteger(stride) || stride < 1) throw new Error(`target guard: bad look source ${name}`);
      lookable.set(name, { arr, stride });
      registered.set(arr, name);
      return arr;
    },
    /**
     * Squint at one shape. Returns { cells, ref: { name: [mean per channel] }, sheet: { name: [...] } }, or null when the
     * shape has fewer than LOOK_MIN_CELLS cells or, in hard mode, the look budget is spent. `ref` names maps given with
     * provide(); `sheet` maps are the painter's own (what the sheet or its ledger holds), averaged over the same cells so
     * both sides are compared at shape level. Every look is recorded in target-guard.json. A look never trips the guard,
     * in any mode or phase.
     */
    look(checkpoint, label, mask, { box = null, ref = [], sheet = {} } = {}) {
      if (!LOOK_CHECKPOINTS.includes(checkpoint)) throw new Error(`target guard: no look at '${checkpoint}' (checkpoints: ${LOOK_CHECKPOINTS.join(', ')})`);
      const n = mask.length, w = box?.w ?? 0;
      const cellsOf = [];
      if (box && w) { for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) { const i = y * w + x; if (mask[i]) cellsOf.push(i); } }
      else for (let i = 0; i < n; i++) if (mask[i]) cellsOf.push(i);
      const cells = cellsOf.length;
      const by = looks.byCheckpoint[checkpoint] ??= { count: 0, refused: 0, overBudget: 0 };
      if (cells < LOOK_MIN_CELLS) { looks.refused++; by.refused++; return null; }
      if (budget != null && looks.count >= budget) { looks.overBudget++; by.overBudget++; return null; }
      const mean = ({ arr, stride }) => { const m = new Float64Array(stride); for (const i of cellsOf) { const b = i * stride; for (let c = 0; c < stride; c++) m[c] += arr[b + c]; } return Array.from(m, v => v / cells); };
      const out = { cells, ref: {}, sheet: {} };
      for (const name of ref) { const s = lookable.get(name); if (!s) throw new Error(`target guard: ${name} was not provided to the look`); out.ref[name] = mean(s); }
      for (const [name, s] of Object.entries(sheet)) { if (lookable.has(name) || registered.has(s.arr)) throw new Error(`target guard: ${name} is a reference map, not the sheet`); out.sheet[name] = mean({ arr: s.arr, stride: s.stride ?? 1 }); }
      looks.count++; looks.cells += cells; by.count++;
      if (looks.entries.length < 400) looks.entries.push({ checkpoint, label, cells, ref: [...ref], sheet: Object.keys(sheet), phase, where: callerLine() });
      return out;
    },
    category() { return violations.length ? 'copied' : blocking ? 'painted' : 'unguarded'; },
    // A painting taken over by a fresh process (tools/aware/pause.mjs) keeps one record of reads and looks.
    exportState() { return { violations: violations.slice(), seen: [...seen], reads: { ...reads }, looks: JSON.parse(JSON.stringify(looks)) }; },
    importState(st) {
      violations.length = 0; violations.push(...st.violations); seen.clear(); for (const k of st.seen) seen.add(k);
      for (const k of Object.keys(reads)) delete reads[k]; Object.assign(reads, st.reads);
      Object.assign(looks, st.looks);
    },
    summary() {
      return {
        category: guard.category(), mode, requestedMode: requested, phase, violations: violations.length,
        blockedAttempts: blocking ? violations.length : 0, elementReads: { ...reads },
        byName: violations.reduce((a, v) => ({ ...a, [v.name]: (a[v.name] || 0) + 1 }), {}), records: violations.slice(0, 200),
        looks: { ...looks, budget, minCells: LOOK_MIN_CELLS, checkpoints: LOOK_CHECKPOINTS, entries: looks.entries.slice() },
      };
    },
  };
  if (mode !== 'off') installHooks();
  return guard;
}

let SHARP_ESM = null;
try { SHARP_ESM = (await import('sharp')).default; } catch { /* no sharp: the fs hooks still hold */ }
let INSTALLED = false;
function installHooks() {
  if (INSTALLED) return; INSTALLED = true;
  const wrap = (obj, name) => {
    const f = obj[name]; if (typeof f !== 'function') return;
    obj[name] = function (p, ...a) { HOOKED?.checkFile(p, 'fs.' + name); return f.call(this, p, ...a); };
  };
  for (const n of ['readFileSync', 'openSync', 'createReadStream', 'readFile', 'open', 'copyFileSync', 'copyFile', 'cpSync', 'cp']) wrap(fs, n);
  for (const n of ['readFile', 'open', 'copyFile', 'cp']) wrap(fs.promises, n);
  // sharp loads as two module objects (the ESM build for import, the CJS one for require): patch both
  const builds = [SHARP_ESM];
  try { builds.push(createRequire(path.join(process.cwd(), 'x.js'))('sharp')); } catch { /* no CJS sharp here */ }
  for (const sharp of new Set(builds.filter(Boolean))) {
    for (const n of ['toBuffer', 'toFile', 'metadata', 'stats', 'raw', 'clone']) {
      const f = sharp.prototype?.[n]; if (typeof f !== 'function') continue;
      sharp.prototype[n] = function (...a) { const inp = this.options?.input; if (inp?.file) HOOKED?.checkFile(inp.file, 'sharp.' + n); return f.apply(this, a); };
    }
  }
}

/** The guard's report beside the painting, so the cheat-risk score and promotion can read it. */
export function writeGuardReport(guard, out, extra = {}) {
  const file = path.join(out, 'target-guard.json');
  fs.writeFileSync(file, JSON.stringify({ ...guard.summary(), ...extra }, null, 1));
  return file;
}
