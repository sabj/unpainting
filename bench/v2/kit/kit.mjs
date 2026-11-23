// bench/kit.mjs, protocol v2: the only way to paint in this benchmark.
//   import * as kit from './kit.mjs';            // import the kit first, and only the kit (no src/ imports)
//   const { sheet, O, W, H } = await kit.open('hills');
//   const map = kit.coarse('hills');            // at most 24x24 cells: palette (8 colours) and value per cell
//   const b = kit.createBrush({ radius: 8, bristles: 16, capacity: 60 });   // radius in sheet cells (0.259 mm a cell)
//   kit.dip(b, { water: 0.8, conc: kit.mix({ sapgreen: 0.4, ochre: 0.1 }) });
//   kit.stroke(b, sheet, [{ x: 10, y: 20, p: 1 }, { x: 60, y: 24, p: 0.8 }]);
//   kit.wait(sheet, 20);                         // let the wet strokes run together a while; kit.dryAll(sheet) dries
//   kit.dryAll(sheet); kit.work(); await kit.finish('note');
// The water: the kit moves it for you. While a brush or pen is on the paper the sheet steps for the brush time that
//   passed, on the main painter's cadence (src/media/water-clock.mjs); a script gives no `between` and calls no step.
//   kit.wait(sheet, moments) lets time pass with the brush off the paper; kit.dryAll(sheet) dries the sheet.
// What is charged: the paintings you run. Each run of a script that lays anything (kit.open, then a mark, to finish or
//   to a stop) is one full-size painting of the whole sheet, at a fixed price of 1, whatever is in it (the levels 2 to 4
//   price of a full-size look; the kit cannot price part of a run, since it does not know the script's whole). Budget
//   BENCH_RUNS (default 3, the owner's 3 paintings' worth a try) per attempt, counted in out/kitlog.jsonl; the run past
//   it is refused before it lays anything. Nothing else is charged: sweeps, dryings, waits,
//   water steps and seconds are measured and recorded beside the score (kit.work(), stats.json), never budgeted.
// One guard, as resource management: a painting that takes more than BENCH_STEP_CEILING (default 10) times the water
//   steps of the automatic painting of its subject is stopped as a runaway, with a plain message; recorded as a stop
//   (out/<task>/runaway.json), never scored.
// Rules the kit enforces (it throws, and you may retry within your budget):
// - No image files may be read (the targets are in your prompt; your own frames are readable under bench/out/).
// - Paint only from the box: conc must come from kit.mix() over BRUSH_PAINTS (brush) or INK (pen); total at most 2 (brush), 8 (pen).
// - Budget 2,500 counted strokes (brush, pen, pencil and eraser) per painting.
// Recorded and reported, not rejected: the share of small strokes (brush radius under 1.5 mm = 5.8 cells), short
// strokes (shorter than 3x the brush width) and dots (shorter than the brush width).
// Stroke log: every counted stroke is also written, in order, to out/<task>/strokes.jsonl.gz (see bench/docs/run-format.md).
//   Logging only reads; it never changes what is painted. BENCH_NO_STROKELOG=1 turns it off (used by the equivalence test).
// Stage frames are saved automatically at 10%, 25%, 50%, 75% and 100% of your strokes; kit.frame(name) adds your own.
// The film: the sheet is also saved, lossless, every second stroke and after every drying, and thinned at the end to at most
//   400 frames evenly through the painting: out/<task>/film/frames.json plus fNNNN.webp, the layout the Studio plays. It only
//   reads the sheet. BENCH_NO_FILM=1 turns it off.
// The pencil: kit.createPencil({ grade: 'HB' | '2B', width }) and kit.pencilStroke(pencil, sheet, pts) lay the session
//   painter's graphite dry on the sheet (src/media/kit-graphite.mjs). The eraser: kit.erase(sheet, pts, { width }) rubs
//   graphite off dry paper (much less of it under dried paint; a trace of paint and soluble ink; no waterproof ink), and
//   refuses a wet sheet. Both count as strokes, go in the stroke log (tool 'pencil', 'eraser') and in the film.
//   The sheet keeps the two graphite grades in two pans the kit does not offer (cadred, paynes), so nothing else moves.
// The pen's ink is soluble (a wash over it rewets it) unless you ask for waterproof ink: kit.open(task, { ink: 'waterproof' }).
// One painting at a time, on the GPU: if another of your processes still holds the GPU, or the GPU cannot be used, kit.open
//   STOPS and names what holds it; it never paints on the CPU by itself. Ask for the CPU by name if you want it (far
//   slower): kit.open(task, { gpu: false }).
import './guard.mjs';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { makePaper } from '../src/media/paper.mjs';
import * as S from '../src/media/sheet.mjs';
import { renderLayers } from '../src/media/km.mjs';
import * as BR from '../src/media/brush.mjs';
import * as PEN from '../src/media/pen.mjs';
import * as GR from '../src/media/kit-graphite.mjs';
import { BOX, boxPigment } from '../src/crop/box.mjs';
import { attachGpu } from '../src/media/gpu/link.mjs';
import { waterClock } from '../src/media/water-clock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROTOCOL = 'v2';
export const BUDGET = 2500, MM = 0.259;
// the targets of this run: the harness installs one coarse map per target in tasks/ next to the kit
export const TASKS = fs.existsSync(path.join(HERE, 'tasks'))
  ? fs.readdirSync(path.join(HERE, 'tasks')).filter(f => f.endsWith('-coarse.json')).map(f => f.slice(0, -'-coarse.json'.length)).sort() : [];
export const BRUSH_PAINTS = ['ultramarine', 'cerulean', 'hansa', 'ochre', 'sienna', 'umber', 'rose', 'sapgreen'];
export const INK = ['sepia', 'lampblack'];
const KEYS = BOX.map(p => p.key);
// the graphite grades sit in two pans of the box that no kit call can mix
const GRAPHITE_PAN = Object.freeze({ HB: 'cadred', '2B': 'paynes' }), GRAPHITE = Object.values(GRAPHITE_PAN).map(k => KEYS.indexOf(k));
export const { DEFAULTS, applyResist, liftResist, blot } = S;
export const RUNS = Number(process.env.BENCH_RUNS) > 0 ? Number(process.env.BENCH_RUNS) : 3;
export const STEP_CEILING = Number(process.env.BENCH_STEP_CEILING) > 0 ? Number(process.env.BENCH_STEP_CEILING) : 10;
const LOCK = path.resolve(HERE, '../../.bench-gpu.lock');
const SLOTS = path.resolve(HERE, '../../.bench-slots'), NSLOTS = 6;
// A few render processes may run at once: open() waits for one of NSLOTS slots, held until the process exits.
async function takeSlot() {
  fs.mkdirSync(SLOTS, { recursive: true });
  for (let waited = 0; ; waited++) {
    for (let k = 0; k < NSLOTS; k++) {
      const d = path.join(SLOTS, 'slot-' + k);
      try { fs.mkdirSync(d); } catch {
        let pid = 0; try { pid = +fs.readFileSync(path.join(d, 'pid'), 'utf8'); } catch {}
        let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch {}
        if (alive || (!pid && Date.now() - fs.statSync(d).mtimeMs < 5000)) continue;
        fs.rmSync(d, { recursive: true, force: true }); try { fs.mkdirSync(d); } catch { continue; }
      }
      fs.writeFileSync(path.join(d, 'pid'), String(process.pid));
      process.on('exit', () => { try { if (+fs.readFileSync(path.join(d, 'pid'), 'utf8') === process.pid) fs.rmSync(d, { recursive: true, force: true }); } catch {} });
      if (waited) console.error(`kit v2: waited ${waited * 3} s for a render slot`);
      return;
    }
    await new Promise(r => setTimeout(r, 3000));
  }
}
const MIXES = new WeakSet(), INKS = new WeakSet(), PENCILS = new WeakSet();
const DIPS = new WeakMap(); // brush or pen -> its last dip, read by the stroke log
const r4 = v => (typeof v === 'number' ? +v.toFixed(4) : v);
function logLine(o) { if (st?.log) st.log.push(JSON.stringify(o)); }
function flushLog() {
  if (!st?.log || st.logWritten) return; st.logWritten = true;
  try { fs.writeFileSync(path.join(st.out, 'strokes.jsonl.gz'), zlib.gzipSync(st.log.join('\n') + '\n', { level: 9 })); } catch (e) { console.error('kit v2: stroke log not written: ' + e.message); }
}
const R_MIN = 1.5 / MM, SNAP_EVERY = 25;
let st = null;

function reject(msg) {
  try { if (process.env.BENCH_VIOLATIONS) fs.appendFileSync(process.env.BENCH_VIOLATIONS.replace(/violations/, 'rejections'), JSON.stringify({ t: Date.now(), task: st?.task, msg }) + '\n'); } catch {}
  throw new Error('protocol v2: ' + msg);
}
function takeGpuLock() {
  try { fs.mkdirSync(LOCK); } catch {
    let pid = 0; try { pid = +fs.readFileSync(path.join(LOCK, 'pid'), 'utf8'); } catch {}
    let alive = false; try { if (pid) { process.kill(pid, 0); alive = true; } } catch {}
    // held: who holds it, so the caller can say so (the process's own command line, as ps gives it)
    if (alive) { let command = ''; try { command = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim().slice(0, 200); } catch {} return { pid, command }; }
    fs.rmSync(LOCK, { recursive: true, force: true }); try { fs.mkdirSync(LOCK); } catch { return { pid: 0, command: 'another painting took it at the same moment' }; }
  }
  fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid));
  const release = () => { try { if (+fs.readFileSync(path.join(LOCK, 'pid'), 'utf8') === process.pid) fs.rmSync(LOCK, { recursive: true, force: true }); } catch {} };
  process.on('exit', release); for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { release(); process.exit(130); });
  return true;
}

/** Concentrations from the box, e.g. mix({ ultramarine: 0.3, sienna: 0.1 }). */
export function mix(byName) {
  const c = new Array(KEYS.length).fill(0);
  for (const [k, v] of Object.entries(byName)) {
    if (!BRUSH_PAINTS.includes(k) && !INK.includes(k)) reject(`paint ${k} is not in the box; brush paints: ${BRUSH_PAINTS.join(', ')}; ink: ${INK.join(', ')}`);
    if (!(v >= 0) || !Number.isFinite(v)) reject(`concentration for ${k} must be a number >= 0`);
    c[KEYS.indexOf(k)] = v;
  }
  if (Object.keys(byName).some(k => INK.includes(k))) INKS.add(c);
  const out = Object.freeze(c); MIXES.add(out); return out;
}
const total = c => c.reduce((a, b) => a + b, 0);

/** The subject's rendering unit, installed by the harness beside its coarse map: {sweeps, dryings, waterSteps, cells, from}, or null. */
const unitOf = task => { try { return JSON.parse(fs.readFileSync(path.join(HERE, 'tasks', `${task}-unit.json`), 'utf8')); } catch { return null; } };

/** The coarse map of a task: { cols, rows, palette: [[r,g,b] x8], cells: palette index per cell, value: 0..1 per cell }. */
export const coarse = task => JSON.parse(fs.readFileSync(path.join(HERE, 'tasks', `${task}-coarse.json`), 'utf8'));

export async function open(task, { seed = +(process.env.BENCH_SEED || 1), gpu = true, threads = 1, ink = 'soluble' } = {}) {
  if (!TASKS.includes(task)) reject(`task must be one of ${TASKS.join(', ')}`);
  if (!['soluble', 'waterproof'].includes(ink)) reject('ink must be "soluble" (the default: a wash over it rewets it and it bleeds) or "waterproof" (a wash over it moves none)');
  await takeSlot();
  const map = coarse(task); const W = map.w, H = map.h;
  const out = path.join(HERE, 'out', task); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'snaps'), { recursive: true }); fs.mkdirSync(path.join(out, 'frames'), { recursive: true }); fs.mkdirSync(path.join(out, 'film'), { recursive: true });
  fs.appendFileSync(path.join(HERE, 'out', 'kitlog.jsonl'), JSON.stringify({ ev: 'open', task, t: Date.now() }) + '\n');
  const O = { ...S.DEFAULTS };
  // The GPU, or a stop: a painting never falls back to the CPU by itself (no silent fallbacks). The CPU is used only when
  // it is asked for by name: kit.open(task, { gpu: false }), or BENCH_CPU=1 (for replaying recorded scripts).
  const useGpu = gpu !== false && !process.env.BENCH_CPU;
  if (useGpu) {
    const held = takeGpuLock();
    if (held !== true) reject(`the GPU is held by another painting of this session: process ${held.pid}${held.command ? ` (${held.command})` : ''}. One painting runs at a time. Nothing was painted: wait for that process to end or stop it, then run again. To paint on the CPU on purpose (far slower), open with kit.open('${task}', { gpu: false })`);
  } else await S.setThreads(threads);
  // the pen's ink, by the name the session painter uses (--set ink=waterproof|soluble): waterproof ink holds to the paper
  // as the painter's set ink does (staining power 60), so later water lifts none of it; soluble is the ink's own profile
  const grade = Object.fromEntries(Object.entries(GRAPHITE_PAN).map(([g, key]) => [key, g]));
  const pigments = BOX.map(p => (grade[p.key] ? GR.gradePigment(grade[p.key]) : ink === 'waterproof' && INK.includes(p.key) ? { ...boxPigment(p), omega: 60 } : boxPigment(p)));
  const sheet = S.createSheet(makePaper(W, H, { seed, scale: 1, toothScale: 0.2, coldPress: { mmPerCell: MM } }), pigments);
  if (useGpu) {
    try { attachGpu(sheet, O, { mode: 'on', log: () => {} }); } catch (e) { reject(`the GPU could not be used (${String(e.message).slice(0, 200)}). Nothing was painted. Run again; to paint on the CPU on purpose (far slower), open with kit.open('${task}', { gpu: false })`); }
    if (!sheet._gpu) reject(`the GPU could not be used (no GPU sheet was attached). Nothing was painted. Run again; to paint on the CPU on purpose (far slower), open with kit.open('${task}', { gpu: false })`);
  }
  const log = process.env.BENCH_NO_STROKELOG ? null : [];
  const work = { dryings: 0, waits: 0, waterSteps: 0 };
  const advance = () => { S.step(sheet, O); work.waterSteps++; };
  st = { work, advance, clock: waterClock(advance), unit: unitOf(task), O, log, logWritten: false, seed, task, out, sheet, pigments, W, H, strokes: 0, pen: 0, pencil: 0, erase: 0, small: 0, short: 0, dots: 0, frames: 0, snaps: [], film: [], t0: Date.now(), backend: sheet._gpu ? 'gpu' : 'cpu', paperRGB: [240, 237, 228], pending: Promise.resolve() };
  logLine({ ev: 'open', protocol: PROTOCOL, task, seed, W, H, mmPerCell: MM, paper: { toothScale: 0.2, coldPress: true }, backend: st.backend, t0: st.t0 });
  process.on('exit', flushLog); // a script that dies before finish() keeps the strokes it laid
  console.error(`kit v2: ${task} ${W}x${H}, ${st.backend}, budget ${BUDGET} strokes; this is painting ${runsSoFar(task) + 1} of the ${RUNS} you may run in this attempt (charged when it lays its first mark)`);
  return { sheet, O, W, H };
}

export const createBrush = opts => BR.createBrush(opts);
export function dip(brush, { water = 1, conc }) {
  if (!MIXES.has(conc)) reject('dip conc must come from kit.mix()');
  if (INKS.has(conc)) reject('ink (sepia, lampblack) is for the pen only');
  if (total(conc) > 2) reject(`brush mix total ${total(conc).toFixed(2)} is over 2`);
  DIPS.set(brush, { water: r4(water), pigments: Array.from(conc, r4) });
  return BR.dip(brush, { water, conc: Array.from(conc) });
}
export const createPen = opts => PEN.createPen(opts);
export function dipPen(pen, conc, amount = 1) {
  if (!MIXES.has(conc)) reject('dipPen conc must come from kit.mix()');
  if (total(conc) > 8) reject(`ink total ${total(conc).toFixed(2)} is over 8`);
  DIPS.set(pen, { amount: r4(amount), pigments: Array.from(conc, r4) });
  return PEN.dipPen(pen, Array.from(conc), amount);
}

const used = () => st.strokes + st.pen + st.pencil + st.erase;   // every counted stroke: brush, pen, pencil, eraser
const lenOf = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
function counted(kind) {
  if (!st) reject('call kit.open() first');
  if (used() >= BUDGET) reject(`stroke budget of ${BUDGET} used up`);
  charge();
  st[kind === 'brush' ? 'strokes' : kind]++;
  const n = used();
  if (n % SNAP_EVERY === 0) snap(n);
  if (n > 1 && (n - 1) % FILM_EVERY === 0) film('painting', n - 1);   // the sheet as it stands before this stroke is laid: after strokes 2, 4, ...
}
// A stroke's own options: the kit moves the water (src/media/water-clock.mjs), so `between` and the step cadence are not the script's.
function own(options, what) {
  if (options == null) return {};
  if (typeof options !== 'object') reject(`${what} options must be an object`);
  for (const k of ['between', 'flowEvery', 'gpuBetween']) if (k in options) reject(`${what}: leave out "${k}". The kit moves the water itself while the brush is on the paper; to let time pass call kit.wait(sheet, moments), to dry call kit.dryAll(sheet)`);
  return options;
}
export function stroke(brush, sheet, pts, options) {
  if (!Array.isArray(pts) || pts.length < 2) reject('a stroke needs a path of at least 2 points');
  options = own(options, 'stroke');
  const r = Math.min(brush.radius, ...pts.map(q => q.r ?? brush.radius)), L = lenOf(pts);
  counted('brush');
  if (r < R_MIN) st.small++;
  if (L < 6 * r) st.short++;
  if (L < 2 * r) st.dots++;
  if (st.log) logLine({ i: used(), tool: 'brush', t: Date.now() - st.t0, brush: { radius: r4(brush.radius), bristles: brush.hairs?.length, capacity: r4(brush.capacity), flat: !!brush.flat }, dip: DIPS.get(brush) ?? null, load: r4(brush.load), dips: brush.dips ?? 0, pts: pts.map(q => ({ x: r4(q.x), y: r4(q.y), p: r4(q.p), ...(q.r != null ? { r: r4(q.r) } : {}) })), options: Object.keys(options).length ? options : null });
  return BR.stroke(brush, sheet, pts, { ...options, ...(sheet === st.sheet ? st.clock.stroke('brush') : {}) });
}
export function penStroke(pen, sheet, pts, options) {
  if (!Array.isArray(pts) || pts.length < 2) reject('a pen line needs at least 2 points');
  options = own(options, 'penStroke');
  counted('pen');
  if (st.log) logLine({ i: used(), tool: 'pen', t: Date.now() - st.t0, pen: { nib: r4(pen.nib), flex: r4(pen.flex), capacity: r4(pen.capacity) }, dip: DIPS.get(pen) ?? null, ink: r4(pen.ink), pts: pts.map(q => ({ x: r4(q.x), y: r4(q.y), p: r4(q.p) })), options: Object.keys(options).length ? options : null });
  return PEN.penStroke(pen, sheet, pts, { ...options, ...(sheet === st.sheet ? st.clock.stroke('pen') : {}) });
}
/** A pencil: grade 'HB' (harder, paler, finer) or '2B' (softer, darker, wider); width in cells at full pressure. */
export function createPencil({ grade = 'HB', width } = {}) {
  let p; try { p = GR.makePencil({ grade, width }, MM); } catch (e) { reject(e.message); }
  PENCILS.add(p); return p;
}
export function pencilStroke(pencil, sheet, pts) {
  if (!PENCILS.has(pencil)) reject('pencilStroke needs a pencil from kit.createPencil()');
  try { GR.checkPath(pts, 'a pencil line'); } catch (e) { reject(e.message); }
  counted('pencil');
  const r = GR.layPencil(sheet, pencil, KEYS.indexOf(GRAPHITE_PAN[pencil.grade]), pts, { graphite: GRAPHITE, seed: st.seed * 131 + used() });
  if (st.log) logLine({ i: used(), tool: 'pencil', t: Date.now() - st.t0, pencil: { grade: pencil.grade, width: pencil.width }, wetCells: r.wet, pts: pts.map(q => ({ x: r4(q.x), y: r4(q.y), p: r4(q.p) })) });
  return r;
}
/** An eraser `width` cells across along pts; pressure p rubs harder. Refuses a wet sheet. */
export function erase(sheet, pts, { width = 12 } = {}) {
  if (!st) reject('call kit.open() first');
  try { GR.checkPath(pts, 'an eraser stroke'); GR.checkEraser(sheet, width); } catch (e) { reject(e.message); }
  counted('erase');
  const r = GR.rubOut(sheet, pts, { width, graphite: GRAPHITE });
  if (st.log) logLine({ i: used(), tool: 'eraser', t: Date.now() - st.t0, eraser: { width: r4(width) }, lifted: { graphiteShare: r4(r.graphiteShare) }, pts: pts.map(q => ({ x: r4(q.x), y: r4(q.y), p: r4(q.p) })) });
  return r;
}
/** Dry the whole sheet: the water settles a moment (30 steps) and the sheet is dried. One drying of the rendering work. */
export function dryAll(sheet, O) {
  if (!st || sheet !== st.sheet) reject('dryAll(sheet): the sheet kit.open() gave');
  charge();
  film('painting');   // wet, as the drying finds it
  for (let q = 0; q < 30; q++) st.advance();
  const r = S.dry(sheet, 30000, O ?? st.O, { levelMax: 140, dt: 14 });
  st.work.dryings++; st.clock.dried();
  logLine({ ev: 'dry', after: used(), t: Date.now() - st.t0 });
  film('dried');
  return r;
}
/** Let time pass with the brush off the paper: the water runs and sinks in for `moments` water steps (default 20; a
 *  moment is about the time a brush takes to travel 17 cells). Wet strokes merge further; nothing dries hard. */
export function wait(sheet, moments = 20) {
  if (!st || sheet !== st.sheet) reject('wait(sheet, moments): the sheet kit.open() gave');
  charge();
  try { st.clock.wait(moments); } catch (e) { reject(e.message); }
  st.work.waits++;
  logLine({ ev: 'wait', moments, after: used(), t: Date.now() - st.t0 });
}
/** What this painting has asked of the simulator so far, measured the same on any machine and never charged, and the
 *  paintings of this attempt: the only thing charged. */
export function work() {
  if (!st) reject('call kit.open() first');
  const w = st.work, u = st.unit, done = runsSoFar(st.task) + (st.charged ? 0 : 1);
  return {
    painting: done, paintingsBudget: RUNS, paintingsLeft: RUNS - done,
    measured: { sweeps: st.strokes, penLines: st.pen, pencilLines: st.pencil, erasures: st.erase, dryings: w.dryings, waits: w.waits,
      waterSteps: w.waterSteps, cellsStepped: w.waterSteps * st.W * st.H, strokeSteps: st.clock.counts.strokeSteps, seconds: Math.round((Date.now() - st.t0) / 1000) },
    // the automatic painting of this subject, for scale, and the runaway guard: recorded, not charged
    auto: u ? { sweeps: u.sweeps, dryings: u.dryings, waterSteps: u.waterSteps ?? null, from: u.from ?? null } : null,
    waterStepsOverAuto: u?.waterSteps > 0 ? +(w.waterSteps / u.waterSteps).toFixed(2) : null,
    runawayAt: u?.waterSteps > 0 ? STEP_CEILING * u.waterSteps : null,
  };
}
// The paintings of this attempt: the runs that laid a mark, counted in out/kitlog.jsonl (one workspace per attempt).
const KITLOG = path.join(HERE, 'out', 'kitlog.jsonl');
const runsSoFar = task => { try { return fs.readFileSync(KITLOG, 'utf8').split('\n').filter(l => l.includes('"ev":"run"') && l.includes(`"task":${JSON.stringify(task)}`)).length; } catch { return 0; } };
// A painting is charged once, at its first mark; the run past the budget is refused. Then the runaway guard.
function charge() {
  if (!st.charged) {
    const before = runsSoFar(st.task);
    if (before >= RUNS) reject(`you have run ${before} paintings in this attempt, the budget of ${RUNS}: this one is refused before it lays anything. Your last finished painting is the one that counts`);
    fs.appendFileSync(KITLOG, JSON.stringify({ ev: 'run', task: st.task, t: Date.now(), n: before + 1 }) + '\n');
    st.charged = true;
  }
  const u = st.unit;
  if (u?.waterSteps > 0 && st.work.waterSteps > STEP_CEILING * u.waterSteps) {
    const msg = `this painting has taken ${st.work.waterSteps} water steps, more than ${STEP_CEILING} times the ${u.waterSteps} of the automatic painting of this subject: it is stopped as a runaway (recorded as a stop, not scored). Fewer, wetter sittings and fewer waits take far fewer steps`;
    try { fs.writeFileSync(path.join(st.out, 'runaway.json'), JSON.stringify({ stopped: true, msg, work: work() }, null, 1)); } catch {}
    reject(msg);
  }
}

export function look() {
  const { sheet, pigments, paperRGB } = st; S.coherent(sheet);
  const base = Buffer.alloc(sheet.n * 3);
  for (let i = 0; i < sheet.n; i++) { const t = 0.96 + 0.04 * sheet.paper.height[i]; for (let c = 0; c < 3; c++) base[i * 3 + c] = Math.min(255, paperRGB[c] * t); }
  return Uint8Array.from(renderLayers(S.layersOf(sheet), pigments, base, sheet.n, 1));
}
const png = (rgb, file) => sharp(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength), { raw: { width: st.W, height: st.H, channels: 3 } }).png().toFile(file);
// The film (see the header). A frame is the sheet as look() gives it, written lossless in the background; nothing is painted.
const FILM_EVERY = 2, FILM_MOST = 400, FILM = !process.env.BENCH_NO_FILM;
function film(stage, after = used()) {
  if (!FILM || !st) return;
  const last = st.film.at(-1);
  if (last && last.after === after && last.stage === stage) return;
  const img = look(), k = st.film.length, src = `t${String(k).padStart(5, '0')}.webp`;
  st.film.push({ src, stage, after });
  st.pending = st.pending.then(() => sharp(Buffer.from(img.buffer, img.byteOffset, img.byteLength), { raw: { width: st.W, height: st.H, channels: 3 } }).webp({ lossless: true, effort: 2 }).toFile(path.join(st.out, 'film', src)));
}
/** At the end: the last frame is the finished sheet; at most FILM_MOST frames are kept, evenly through, every 'dried' frame among them while they fit. */
async function closeFilm(final) {
  if (!FILM) return null;
  const dir = path.join(st.out, 'film'), n = used(), all = st.film;
  await sharp(final).webp({ lossless: true, effort: 2 }).toFile(path.join(dir, 't-final.webp')); all.push({ src: 't-final.webp', stage: 'finished', after: n });
  let keep = all.map((_, i) => i);
  if (all.length > FILM_MOST) { const even = new Set(Array.from({ length: FILM_MOST }, (_, j) => Math.round(j * (all.length - 1) / (FILM_MOST - 1)))); keep = keep.filter(i => even.has(i)); }
  const frames = keep.map((i, j) => { const f = all[i], src = `f${String(j).padStart(4, '0')}.webp`; fs.renameSync(path.join(dir, f.src), path.join(dir, src)); return { src, stage: f.stage, strokes: f.after, of: n, position: keep.length > 1 ? j / (keep.length - 1) : 1 }; });
  for (const f of fs.readdirSync(dir)) if (/^t.*\.webp$/.test(f)) fs.rmSync(path.join(dir, f));
  const doc = { painter: 'bench kit ' + PROTOCOL, task: st.task, width: st.W, height: st.H, presentation: { framePolicy: `every ${FILM_EVERY} strokes and each drying, at most ${FILM_MOST} kept evenly`, frameFormat: 'webp (lossless)', saved: all.length, kept: frames.length }, frames };
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(doc));
  return { frames: frames.length, saved: all.length };
}
function snap(n) {
  const img = look(), f = path.join(st.out, 'snaps', `${String(n).padStart(4, '0')}.png`);
  st.snaps.push(n); logLine({ ev: 'snap', after: n, t: Date.now() - st.t0 }); st.pending = st.pending.then(() => png(img, f));
}
export async function frame(name) {
  st.frames++; logLine({ ev: 'frame', name: String(name), after: used(), t: Date.now() - st.t0 });
  return png(look(), path.join(st.out, 'frames', `own-${String(st.frames).padStart(2, '0')}-${String(name).replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`));
}
export async function finish(note = '') {
  const n = used();
  await st.pending;
  const final = path.join(st.out, 'final.png'); await png(look(), final);
  const filmed = await closeFilm(final);
  const stages = {};
  for (const pct of [10, 25, 50, 75]) {
    const want = Math.ceil(n * pct / 100), got = st.snaps.find(s => s >= want);
    if (got != null) { fs.copyFileSync(path.join(st.out, 'snaps', `${String(got).padStart(4, '0')}.png`), path.join(st.out, 'frames', `stage-${pct}.png`)); stages[pct] = got; }
  }
  fs.copyFileSync(final, path.join(st.out, 'frames', 'stage-100.png')); stages[100] = n;
  for (const [pct, after] of Object.entries(stages)) logLine({ ev: 'stage', pct: +pct, after });
  logLine({ ev: 'finish', strokes: n, t: Date.now() - st.t0, note });
  flushLog();
  fs.rmSync(path.join(st.out, 'snaps'), { recursive: true, force: true });
  const stats = { protocol: PROTOCOL, task: st.task, film: filmed, brushStrokes: st.strokes, penStrokes: st.pen, pencilStrokes: st.pencil, eraserStrokes: st.erase, smallStrokes: st.small, shortStrokes: st.short, dotStrokes: st.dots, smallShare: st.strokes ? +(st.small / st.strokes).toFixed(3) : 0, strokes: n, budget: BUDGET, stageStrokes: stages, seconds: Math.round((Date.now() - st.t0) / 1000), backend: st.backend, note, seed: st.seed, sheet: { W: st.W, H: st.H, mmPerCell: MM }, strokeLog: st.log ? 'strokes.jsonl.gz' : null, work: work() };
  fs.writeFileSync(path.join(st.out, 'stats.json'), JSON.stringify(stats, null, 2));
  fs.appendFileSync(path.join(HERE, 'out', 'kitlog.jsonl'), JSON.stringify({ ev: 'finish', task: st.task, t: Date.now(), strokes: n }) + '\n');
  if (st.sheet._gpu) st.sheet._gpu.close();
  console.error(`kit v2: wrote ${final} (${n} strokes, ${st.small} small)`);
  return stats;
}
