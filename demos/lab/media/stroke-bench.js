// Generated from src/media/stroke-bench.mjs by tools/lab/sync-site-media.mjs. Edit the source.
// The stroke bench: a fixed set of single strokes that show what the brush, pen and pencil do, each on its own small
// sheet, sized in millimetres so every cell size lays the same marks. The brushes are the painter's own (brush-kit.mjs),
// the pen and pencil the painter's drawing materials (drawing-materials.mjs), so a change to the brush code or its
// settings shows on the bench. Paint Lab's stroke bench (demos/lab/strokes/) runs it on the CPU sheet and on its WebGPU
// sheet; `ops` carries the backend's flow, drying and coherence. DOM free.
import { makePaper } from './paper.js';
import { createSheet, step, fix, DEFAULTS } from './sheet.js';
import { createBrush, dip, stroke } from './brush.js';
import { createPen, dipPen, penStroke } from './pen.js';
import { pencilDraw } from './graphite.js';
import { TECHNIQUES, washBrushOptions, penContact } from './brush-kit.js';
import { MATERIAL_PROFILES } from './drawing-materials.js';

export const CELL_SIZES_MM = Object.freeze([0.25, 0.1, 0.05]);
const INK = MATERIAL_PROFILES['sepia-ink'], GRAPHITE = MATERIAL_PROFILES['graphite-HB'];
// The sheet's channels: the wash pigment, the sepia ink, HB graphite, then the four glaze colours (yellow, green, cyan,
// rose), all the caller's but the ink and graphite.
export const WASH = 0, INK_AT = 1, GRAPHITE_AT = 2;
const GLAZE_AT = { yellow: 3, green: 4, cyan: 5, rose: 6 };
export const benchPigments = (wash, glaze) => [wash, INK.pigment, GRAPHITE.pigment, glaze.yellow, glaze.green, glaze.cyan, glaze.rose];

// Papers as the painter's paper model draws them. Lengths in the model are cells; `scale` keeps fibres and tooth the same
// size in millimetres at a finer cell, as Paint Lab's papers do above 120 dpi.
const PAPER_MM = 25.4 / 120;
export const BENCH_PAPERS = Object.freeze({
  cold: Object.freeze({ name: 'cold press', model: {} }),
  rough: Object.freeze({ name: 'rough', model: { fibres: 0.45, tooth: 0.85, toothScale: 1.6, patternScale: 1.4 } }),
});
function benchPaper(kind, w, h, mmPerCell, seed = 7) {
  const scale = Math.max(1, PAPER_MM / mmPerCell);
  return { ...makePaper(w, h, { seed, ...BENCH_PAPERS[kind].model, scale, proudBlur: scale, coldPress: { mmPerCell }, mmPerCell }), mmPerCell };
}

// Hand speed as flow during the stroke: the sheet steps this often per millimetre of travel.
export const SPEEDS = Object.freeze({ slow: 1.5, medium: 0.5, fast: 0 });
const SEGMENT_MM = 2;
const BOX = { w: 64, h: 20 };
const line = (x0, y0, x1, y1, n = 24) => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + (x1 - x0) * i / n, y: y0 + (y1 - y0) * i / n }));
const swell = (pts, f) => pts.map((q, i) => ({ ...q, p: f(i / (pts.length - 1)) }));
const ease = u => Math.min(1, u / 0.08, (1 - u) / 0.1);

const bars = wet => async c => {
  for (const [k, x] of [['yellow', 20], ['green', 32], ['cyan', 44]]) await c.drag(c.brush('flat', 6, 'wet on dry', 0.9, 1, x, k), [{ x, y: 4 }, { x: x - 1, y: 21 }, { x: x - 2, y: 38 }].map(q => ({ ...q, p: 0.8 })), { upright: false });
  if (!wet) await c.dryAll();
  await c.drag(c.brush('flat', 6, wet ? 'wet on wet' : 'glazed', 0.9, 1, 9, 'rose'), swell(line(6, 20, 58, 22), u => 0.8 * ease(u)));
};

/**
 * The strokes. Each has its label fields (tool, load, pressure, speed, paper) and `lay(ctx)`, which paints it through
 * ctx (sheet units are millimetres there). Loads are the dip's water share; pressure is the brush's p.
 */
export const BENCH_STROKES = Object.freeze([
  { id: 'flat-loaded', title: 'Loaded flat drag', tool: 'flat 10 mm', technique: 'first wash', load: 1, pressure: 0.8, speed: 'medium', paper: 'cold',
    lay: c => c.drag(c.brush('flat', 10, 'first wash', 1), swell(line(6, 10, 58, 10), u => 0.8 * ease(u))) },
  { id: 'flat-half', title: 'Half-empty', tool: 'flat 10 mm', technique: 'first wash', load: 0.5, pressure: 0.8, speed: 'medium', paper: 'cold',
    lay: c => c.drag(c.brush('flat', 10, 'first wash', 0.5), swell(line(6, 10, 58, 10), u => 0.8 * ease(u))) },
  { id: 'dry-slow', title: 'Nearly dry, slow', tool: 'flat 10 mm', technique: 'dry brush', load: 0.12, pressure: 0.9, speed: 'slow', paper: 'cold',
    lay: c => c.drag(c.brush('flat', 10, 'dry brush', 0.12), swell(line(6, 10, 58, 10), u => 0.9 * ease(u)), { speed: 'slow' }) },
  { id: 'dry-fast', title: 'Nearly dry, fast', tool: 'flat 10 mm', technique: 'dry brush', load: 0.12, pressure: 0.9, speed: 'fast', paper: 'cold',
    lay: c => c.drag(c.brush('flat', 10, 'dry brush', 0.12), swell(line(6, 10, 58, 10), u => 0.9 * ease(u)), { speed: 'fast' }) },
  { id: 'flat-light', title: 'Light pressure', tool: 'flat 10 mm', technique: 'first wash', load: 1, pressure: 0.25, speed: 'medium', paper: 'cold',
    lay: c => c.drag(c.brush('flat', 10, 'first wash', 1), swell(line(6, 10, 58, 10), u => 0.25 * ease(u))) },
  { id: 'flat-curve', title: 'Curved drag', tool: 'flat 10 mm', technique: 'first wash', load: 1, pressure: 0.8, speed: 'medium', paper: 'cold', h: 30,
    lay: c => c.drag(c.brush('flat', 10, 'first wash', 1), Array.from({ length: 33 }, (_, i) => { const a = Math.PI * (0.92 - 0.84 * i / 32); return { x: 32 + 24 * Math.cos(a), y: 26 - 17 * Math.sin(a), p: 0.8 * ease(i / 32) }; }), { upright: false }) },
  { id: 'round-press', title: 'Round, point to belly and lift', tool: 'round 6 mm', technique: 'wet on dry', load: 1, pressure: '0.1-1-0.1', speed: 'medium', paper: 'cold',
    lay: c => c.drag(c.brush('round', 6, 'wet on dry', 1), swell(line(6, 10, 58, 10, 32), u => 0.1 + 0.9 * Math.sin(Math.PI * u) ** 1.5), { upright: false }) },
  { id: 'round-side', title: 'Round on its side', tool: 'round 6 mm', technique: 'wet on dry', load: 0.8, pressure: 1, speed: 'medium', paper: 'cold',
    lay: c => c.drag(c.brush('round', 6, 'wet on dry', 0.8), swell(line(6, 10, 58, 10), u => ease(u)), { upright: true }) },
  { id: 'wet-merge', title: 'Two overlapping wet sweeps', tool: 'flat 10 mm', technique: 'wet on wet', load: 1, pressure: 0.8, speed: 'medium', paper: 'cold', h: 26,
    lay: async c => { await c.drag(c.brush('flat', 10, 'wet on wet', 1), swell(line(6, 9, 58, 9), u => 0.8 * ease(u))); await c.drag(c.brush('flat', 10, 'wet on wet', 1, 0.6), swell(line(58, 16, 6, 16), u => 0.8 * ease(u)), { seed: 2 }); } },
  { id: 'bloom', title: 'Wet stroke beside a damp one', tool: 'flat 10 mm', technique: 'wet on wet', load: 1, pressure: 0.8, speed: 'medium', paper: 'cold', h: 26,
    lay: async c => { await c.drag(c.brush('flat', 10, 'first wash', 0.8), swell(line(6, 8, 58, 8), u => 0.8 * ease(u))); await c.untilDamp(); await c.drag(c.brush('flat', 10, 'wet on wet', 1, 0.25), swell(line(6, 17, 58, 17), u => 0.8 * ease(u)), { seed: 2 }); } },
  { id: 'graded', title: 'Graded wash, five sweeps', tool: 'flat 10 mm', technique: 'wet on wet', load: 1, pressure: 0.8, speed: 'medium', paper: 'cold', h: 44,
    lay: async c => { for (let k = 0; k < 5; k++) await c.drag(c.brush('flat', 10, 'wet on wet', 1, 1 - k * 0.22, k), swell(k % 2 ? line(58, 8 + 7 * k, 6, 8 + 7 * k) : line(6, 8 + 7 * k, 58, 8 + 7 * k), u => 0.8 * ease(u)), { seed: k }); } },
  { id: 'glaze-dry', title: 'Rose bar over dry yellow, green, cyan', tool: 'flat 6 mm', technique: 'glazed', load: 0.9, pressure: 0.8, speed: 'medium', paper: 'cold', h: 42, lay: bars(false) },
  { id: 'glaze-wet', title: 'Rose bar into wet yellow, green, cyan', tool: 'flat 6 mm', technique: 'wet on wet', load: 0.9, pressure: 0.8, speed: 'medium', paper: 'cold', h: 42, lay: bars(true) },
  { id: 'pen', title: 'Pen line, pressure change', tool: 'sepia pen', technique: 'ink', load: 1, pressure: '0.1-1-0.1', speed: 'medium', paper: 'cold',
    lay: c => c.pen(line(6, 10, 58, 10, 48).map((q, i) => ({ ...q, s: Math.sin(Math.PI * i / 48) ** 2 }))) },
  { id: 'pencil', title: 'Pencil, light then firm', tool: 'HB pencil', technique: 'graphite', load: '-', pressure: '0.3 / 1', speed: 'medium', paper: 'rough',
    lay: c => c.pencil([line(6, 7, 58, 7, 48).map(q => ({ ...q, s: 0.3 })), line(6, 13, 58, 13, 48).map(q => ({ ...q, s: 1 }))]) },
]);

export const strokeSize = (s, mmPerCell) => ({ w: Math.round(BOX.w / mmPerCell), h: Math.round((s.h ?? BOX.h) / mmPerCell) });
// Wash pigment load: per unit of water in the dip.
const CONC = 0.45;
const DRY = { settle: 60, dt: 2 };

/**
 * Lay one bench stroke on a fresh sheet and dry it. ops (all may be async):
 *   attach(sheet)          the backend takes the new sheet
 *   instrument(points, reach, fn)  fn lays a mark through `points` (cells); the backend makes them current first
 *   step(n) -> wet         n flow steps; whether anything is still wet
 *   read()                 the CPU copy current everywhere
 *   fix()                  dry the wet layer into a layer
 * Returns { sheet, pigments, steps }.
 */
export async function layBenchStroke(s, { mmPerCell, wash, glaze, ops = cpuOps(), O = DEFAULTS, maxSteps = 4000 }) {
  const { w, h } = strokeSize(s, mmPerCell), cells = mm => mm / mmPerCell, pigments = benchPigments(wash, glaze);
  const sheet = createSheet(benchPaper(s.paper, w, h, mmPerCell), pigments);
  await ops.attach?.(sheet, O);
  let steps = 0;
  const flow = async n => { if (n <= 0) return true; steps += n; return ops.step(sheet, n, O); };
  // Dry as the painter does (sheet.mjs dry): a settle at the working time step, then long steps until no water is left.
  const dryOut = async () => {
    await flow(DRY.settle);
    const D = { ...O, dt: DRY.dt };
    for (let k = 0; k * 32 < maxSteps; k++) { steps += 32; if (!(await ops.step(sheet, 32, D))) break; }
    await ops.fix(sheet);
  };
  const c = {
    brush(kind, widthMm, technique, load, concShare = 1, seed = 0, colour = null) {
      const T = TECHNIQUES[technique], r = cells(widthMm) / 2, conc = pigments.map(() => 0);
      conc[colour ? GLAZE_AT[colour] : WASH] = CONC * concShare;
      const b = createBrush(washBrushOptions(r, T, 11 + seed, { round: kind === 'round' }));
      dip(b, { water: load, conc });
      return b;
    },
    // A drag in segments of SEGMENT_MM; the sheet flows between them as fast as the hand is slow.
    async drag(brush, ptsMm, { speed = 'medium', upright = 'sweep' } = {}) {
      const pts = ptsMm.map(q => ({ x: cells(q.x), y: cells(q.y), p: q.p ?? 0.8, r: brush.radius }));
      const per = SPEEDS[speed] * SEGMENT_MM, segs = [];
      let seg = [pts[0]], run = 0;
      for (let i = 1; i < pts.length; i++) { seg.push(pts[i]); run += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) * mmPerCell; if (run >= SEGMENT_MM || i === pts.length - 1) { segs.push(seg); seg = [pts[i]]; run = 0; } }
      for (let k = 0; k < segs.length; k++) {
        await ops.instrument(sheet, segs[k], brush.radius * 2 + 4, () => stroke(brush, sheet, segs[k], { lift: k === segs.length - 1, upright }));
        await flow(Math.round(per));
      }
    },
    // Flow until no standing water is left: the paper damp, its pores still wet.
    async untilDamp() {
      for (let k = 0; k < 400; k++) { await flow(4); await ops.read(sheet); let standing = 0; for (let i = 0; i < sheet.n; i++) if (sheet.W[i] > 1e-3) standing++; if (standing < sheet.n * 0.002) return; }
    },
    // The sheet dried as at the end of a stroke, so the next is laid on a dry layer.
    async dryAll() { await dryOut(); },
    async pen(ptsMm) {
      const pen = createPen({ nib: INK.widthMm[0] / mmPerCell, flex: (INK.widthMm[1] - INK.widthMm[0]) / mmPerCell });
      dipPen(pen, pigments.map((_, k) => (k === INK_AT ? INK.concentration : 0)));
      const path = ptsMm.map(q => ({ x: cells(q.x), y: cells(q.y), ...penContact(q.s) }));
      await ops.instrument(sheet, path, cells(INK.widthMm[1]) * 4 + 12, () => penStroke(pen, sheet, path));
    },
    async pencil(lines) {
      const strokes = lines.map(l => ({ points: l.map(q => ({ x: cells(q.x), y: cells(q.y), s: q.s, nw: cells(GRAPHITE.widthMm[0] + (GRAPHITE.widthMm[1] - GRAPHITE.widthMm[0]) * q.s ** GRAPHITE.pressureExponent) })) }));
      const all = strokes.flatMap(g => g.points);
      await ops.instrument(sheet, all, cells(GRAPHITE.widthMm[1]) + 4, () => pencilDraw(sheet, strokes, GRAPHITE_AT, { amount: GRAPHITE.concentration, width: cells(GRAPHITE.widthMm[1]), vary: 0.15, tooth: 0.4, pressureReference: 1, usePointWidths: true, arcScale: mmPerCell / (152.4 / 1080) }));
    },
  };
  await s.lay(c);
  await dryOut();
  await ops.read(sheet);
  return { sheet, pigments, steps };
}

/** The CPU sheet's ops. */
export const cpuOps = () => ({
  instrument: (sheet, points, reach, fn) => fn(),
  step: (sheet, n, O) => { let wet = true; for (let i = 0; i < n && wet; i++) wet = step(sheet, O); return wet; },
  read: () => {},
  fix: sheet => fix(sheet),
});
