// bench/kit.mjs, protocol v2: the only way to paint in this benchmark.
//   import * as kit from './kit.mjs';            // import the kit first, and only the kit (no src/ imports)
//   const { sheet, O, W, H } = await kit.open('hills');
//   const map = kit.coarse('hills');            // at most 24x24 cells: palette (8 colours) and value per cell
//   const b = kit.createBrush({ radius: 8, bristles: 16, capacity: 60 });   // radius in sheet cells (0.259 mm a cell)
//   kit.dip(b, { water: 0.8, conc: kit.mix({ sapgreen: 0.4, ochre: 0.1 }) });
//   kit.stroke(b, sheet, [{ x: 10, y: 20, p: 1 }, { x: 60, y: 24, p: 0.8 }]);
//   kit.dryAll(sheet, O); await kit.finish('note');
// Rules the kit enforces (it throws, and you may retry within your budget):
// - No image files may be read (the targets are in your prompt; your own frames are readable under bench/out/).
// - Paint only from the box: conc must come from kit.mix() over BRUSH_PAINTS (brush) or INK (pen); total at most 2 (brush), 8 (pen).
// - Budget 2,500 counted strokes (brush plus pen) per painting.
// Recorded and reported, not rejected: the share of small strokes (brush radius under 1.5 mm = 5.8 cells), short
// strokes (shorter than 3x the brush width) and dots (shorter than the brush width).
// Stroke log: every counted stroke is also written, in order, to out/<task>/strokes.jsonl.gz (see bench/docs/run-format.md).
//   Logging only reads; it never changes what is painted. BENCH_NO_STROKELOG=1 turns it off (used by the equivalence test).
// Stage frames are saved automatically at 10%, 25%, 50%, 75% and 100% of your strokes; kit.frame(name) adds your own.
import './guard.mjs';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { makePaper } from '../src/media/paper.mjs';
import * as S from '../src/media/sheet.mjs';
import { renderLayers } from '../src/media/km.mjs';
import * as BR from '../src/media/brush.mjs';
import * as PEN from '../src/media/pen.mjs';
import { BOX, boxPigment } from '../src/crop/box.mjs';
import { attachGpu } from '../src/media/gpu/link.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROTOCOL = 'v2';
export const BUDGET = 2500, MM = 0.259;
export const TASKS = ['hills', 'south-france', 'sargent', 'trumbull'];
export const BRUSH_PAINTS = ['ultramarine', 'cerulean', 'hansa', 'ochre', 'sienna', 'umber', 'rose', 'sapgreen'];
export const INK = ['sepia', 'lampblack'];
const KEYS = BOX.map(p => p.key);
export const { step, dry, DEFAULTS, applyResist, liftResist, blot } = S;
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
const MIXES = new WeakSet(), INKS = new WeakSet();
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
    if (alive) return false;
    fs.rmSync(LOCK, { recursive: true, force: true }); try { fs.mkdirSync(LOCK); } catch { return false; }
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

/** The coarse map of a task: { cols, rows, palette: [[r,g,b] x8], cells: palette index per cell, value: 0..1 per cell }. */
export const coarse = task => JSON.parse(fs.readFileSync(path.join(HERE, 'tasks', `${task}-coarse.json`), 'utf8'));

export async function open(task, { seed = +(process.env.BENCH_SEED || 1), gpu = true, threads = 1 } = {}) {
  if (!TASKS.includes(task)) reject(`task must be one of ${TASKS.join(', ')}`);
  await takeSlot();
  const map = coarse(task); const W = map.w, H = map.h;
  const out = path.join(HERE, 'out', task); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(path.join(out, 'snaps'), { recursive: true }); fs.mkdirSync(path.join(out, 'frames'), { recursive: true });
  fs.appendFileSync(path.join(HERE, 'out', 'kitlog.jsonl'), JSON.stringify({ ev: 'open', task, t: Date.now() }) + '\n');
  const O = { ...S.DEFAULTS };
  const useGpu = gpu && !process.env.BENCH_CPU && takeGpuLock(); // BENCH_CPU=1 forces the CPU backend (for replaying recorded scripts)
  if (!useGpu) await S.setThreads(threads);
  const pigments = BOX.map(p => boxPigment(p));
  const sheet = S.createSheet(makePaper(W, H, { seed, scale: 1, toothScale: 0.2, coldPress: { mmPerCell: MM } }), pigments);
  if (useGpu) attachGpu(sheet, O, { mode: 'auto', log: () => {} });
  const log = process.env.BENCH_NO_STROKELOG ? null : [];
  st = { log, logWritten: false, seed, task, out, sheet, pigments, W, H, strokes: 0, pen: 0, small: 0, short: 0, dots: 0, frames: 0, snaps: [], t0: Date.now(), backend: sheet._gpu ? 'gpu' : 'cpu', paperRGB: [240, 237, 228], pending: Promise.resolve() };
  logLine({ ev: 'open', protocol: PROTOCOL, task, seed, W, H, mmPerCell: MM, paper: { toothScale: 0.2, coldPress: true }, backend: st.backend, t0: st.t0 });
  process.on('exit', flushLog); // a script that dies before finish() keeps the strokes it laid
  console.error(`kit v2: ${task} ${W}x${H}, ${st.backend}, budget ${BUDGET}`);
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

const lenOf = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
function counted(kind) {
  if (!st) reject('call kit.open() first');
  if (st.strokes + st.pen >= BUDGET) reject(`stroke budget of ${BUDGET} used up`);
  if (kind === 'pen') st.pen++; else st.strokes++;
  const n = st.strokes + st.pen;
  if (n % SNAP_EVERY === 0) snap(n);
}
export function stroke(brush, sheet, pts, options) {
  if (!Array.isArray(pts) || pts.length < 2) reject('a stroke needs a path of at least 2 points');
  const r = Math.min(brush.radius, ...pts.map(q => q.r ?? brush.radius)), L = lenOf(pts);
  counted('brush');
  if (r < R_MIN) st.small++;
  if (L < 6 * r) st.short++;
  if (L < 2 * r) st.dots++;
  if (st.log) logLine({ i: st.strokes + st.pen, tool: 'brush', t: Date.now() - st.t0, brush: { radius: r4(brush.radius), bristles: brush.hairs?.length, capacity: r4(brush.capacity), flat: !!brush.flat }, dip: DIPS.get(brush) ?? null, load: r4(brush.load), dips: brush.dips ?? 0, pts: pts.map(q => ({ x: r4(q.x), y: r4(q.y), p: r4(q.p), ...(q.r != null ? { r: r4(q.r) } : {}) })), options: options ?? null });
  return BR.stroke(brush, sheet, pts, options);
}
export function penStroke(pen, sheet, pts, options) {
  if (!Array.isArray(pts) || pts.length < 2) reject('a pen line needs at least 2 points');
  counted('pen');
  if (st.log) logLine({ i: st.strokes + st.pen, tool: 'pen', t: Date.now() - st.t0, pen: { nib: r4(pen.nib), flex: r4(pen.flex), capacity: r4(pen.capacity) }, dip: DIPS.get(pen) ?? null, ink: r4(pen.ink), pts: pts.map(q => ({ x: r4(q.x), y: r4(q.y), p: r4(q.p) })), options: options ?? null });
  return PEN.penStroke(pen, sheet, pts, options);
}
export function dryAll(sheet, O = S.DEFAULTS) { for (let q = 0; q < 30; q++) S.step(sheet, O); return S.dry(sheet, 30000, O, { levelMax: 140, dt: 14 }); }

export function look() {
  const { sheet, pigments, paperRGB } = st; S.coherent(sheet);
  const base = Buffer.alloc(sheet.n * 3);
  for (let i = 0; i < sheet.n; i++) { const t = 0.96 + 0.04 * sheet.paper.height[i]; for (let c = 0; c < 3; c++) base[i * 3 + c] = Math.min(255, paperRGB[c] * t); }
  return Uint8Array.from(renderLayers(S.layersOf(sheet), pigments, base, sheet.n, 1));
}
const png = (rgb, file) => sharp(Buffer.from(rgb.buffer, rgb.byteOffset, rgb.byteLength), { raw: { width: st.W, height: st.H, channels: 3 } }).png().toFile(file);
function snap(n) {
  const img = look(), f = path.join(st.out, 'snaps', `${String(n).padStart(4, '0')}.png`);
  st.snaps.push(n); logLine({ ev: 'snap', after: n, t: Date.now() - st.t0 }); st.pending = st.pending.then(() => png(img, f));
}
export async function frame(name) {
  st.frames++; logLine({ ev: 'frame', name: String(name), after: st.strokes + st.pen, t: Date.now() - st.t0 });
  return png(look(), path.join(st.out, 'frames', `own-${String(st.frames).padStart(2, '0')}-${String(name).replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`));
}
export async function finish(note = '') {
  const n = st.strokes + st.pen;
  await st.pending;
  const final = path.join(st.out, 'final.png'); await png(look(), final);
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
  const stats = { protocol: PROTOCOL, task: st.task, brushStrokes: st.strokes, penStrokes: st.pen, smallStrokes: st.small, shortStrokes: st.short, dotStrokes: st.dots, smallShare: st.strokes ? +(st.small / st.strokes).toFixed(3) : 0, strokes: n, budget: BUDGET, stageStrokes: stages, seconds: Math.round((Date.now() - st.t0) / 1000), backend: st.backend, note, seed: st.seed, sheet: { W: st.W, H: st.H, mmPerCell: MM }, strokeLog: st.log ? 'strokes.jsonl.gz' : null };
  fs.writeFileSync(path.join(st.out, 'stats.json'), JSON.stringify(stats, null, 2));
  fs.appendFileSync(path.join(HERE, 'out', 'kitlog.jsonl'), JSON.stringify({ ev: 'finish', task: st.task, t: Date.now(), strokes: n }) + '\n');
  if (st.sheet._gpu) st.sheet._gpu.close();
  console.error(`kit v2: wrote ${final} (${n} strokes, ${st.small} small)`);
  return stats;
}
