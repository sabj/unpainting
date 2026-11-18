// The graphite drawing carries the structure of the subject, whatever its medium. Its lines are the line model's pool
// (line-model.mjs) held to the target and pruned by meaning (ink-lines-file.mjs: region labels, mass edges, foliage, whole
// lines kept or left off, ticks under 3 mm gone), then drawn light in graphite. A plan's own opening lines stay; a pool line
// the plan already drew is not drawn twice. Texture, shadow and wash edges and the sheet border go to the washes.
import fs from 'node:fs';
import path from 'node:path';
import { traceLineModel } from './line-model.mjs';
import { linePython } from './line-python.mjs';
import { holdInkLines } from './ink-lines-file.mjs';
import { INK_HOLD_FLAGS } from './ink-hold-defaults.mjs';
import { linePaths, readLineText } from '../../crop/lines.mjs';
import { STAGE_DEFAULTS } from './drawing-stages.mjs';
import { labPlanes } from './line-evidence.mjs';
import sharp from 'sharp';

/** The graphite opening pressure of the pool drawing: a drawing, not a finish. */
const GRAPHITE_POOL_PRESSURE = '0.35';

const last = (argv, name) => { const at = argv.lastIndexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
const isGraphite = v => v === undefined || v === 'graphite' || /^graphite-/.test(String(v));

/** Whether the opening graphite drawing comes from the line model's pool, and why not when it does not. */
export function graphitePoolWanted(argv) {
  const no = why => ({ wanted: false, why });
  if (!isGraphite(last(argv, '--outlinemedium'))) return no('the outline medium is not graphite');
  if (last(argv, '--drawing') === 'none' || last(argv, '--draw') === '0') return no('no drawing is asked for');
  const source = last(argv, '--linesource');
  if (source !== undefined && source !== 'none') return no(`--linesource ${source} names the line set`);
  const stages = last(argv, '--stages');
  if (stages !== undefined && stages !== 'none') return no('--stages names the drawing stages');
  if (['0', 'off'].includes(last(argv, '--linemodel'))) return no('--linemodel is off');
  if (last(argv, '--segments') === 'off') return no('--segments off leaves no regions to decide the lines by');
  if (argv.includes('--areaplan')) return no('an area plan decides its own lines');
  if (argv.includes('--resumestate')) return no('a resumed painting keeps its drawing');
  return { wanted: true, why: 'graphite carries the structure of the subject' };
}

/** The median tone step (L*) across a line, read `offMm` either side of each point: a window edge is strong, a mortar joint weak. */
export function edgeStep(line, L, w, h, pxMm, offMm = 1.2) {
  const P = line.points, off = offMm / pxMm, steps = [];
  const at = (x, y) => L[Math.max(0, Math.min(h - 1, Math.round(y))) * w + Math.max(0, Math.min(w - 1, Math.round(x)))];
  for (let k = 0; k < P.length; k++) {
    const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], tx = b[0] - a[0], ty = b[1] - a[1], n = Math.hypot(tx, ty) || 1, nx = -ty / n, ny = tx / n;
    steps.push(Math.abs(at(P[k][0] + nx * off, P[k][1] + ny * off) - at(P[k][0] - nx * off, P[k][1] - ny * off)));
  }
  steps.sort((x, y) => x - y);
  return steps.length ? steps[steps.length >> 1] : 0;
}

const pathMm = (pts, pxMm) => { let s = 0; for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return s * pxMm; };

/**
 * The drawing's line file: the plan's authored lines (scaled onto the pool's grid), then every pool line the authored ones
 * do not already draw (at least `share` of its points within `nearMm` of an authored line), best `score` first (default the
 * longest) up to `amount` of the pool's length.
 * @returns {{ image, lines, inputKind, inkDecided, stats }}
 */
export function mergeAuthored(pool, authored, { sheetMm, nearMm = 1, share = 0.6, amount = 1, score = null }) {
  const { w, h } = pool.image, pxMm = sheetMm / w, f = authored ? w / authored.image.w : 1;
  const own = authored ? authored.lines.map(g => ({ ...g, points: g.points.map(([x, y]) => [x * f, y * f]), ...(Array.isArray(g.widths) ? { widths: g.widths.map(v => v * f) } : {}) })) : [];
  const cell = Math.max(1, nearMm / pxMm), bins = new Map(), key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const g of own) for (const [x, y] of g.points) { const k = key(x, y); (bins.get(k) ?? bins.set(k, []).get(k)).push([x, y]); }
  const near = ([x, y]) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [a, b] of bins.get(key(x + dx * cell, y + dy * cell)) ?? []) if (Math.hypot(a - x, b - y) <= cell) return true; return false; };
  const fresh = pool.lines.filter(g => g.points.filter(near).length < share * g.points.length);
  // the drawing is the highest-scoring lines (by default the longest), whole, up to `amount` of the pool's length: big shapes and
  // strong edges first, the rest left to the brush
  const len = g => pathMm(g.points, pxMm), rank = score ?? len, total = fresh.reduce((s, g) => s + len(g), 0), added = [];
  for (const g of [...fresh].sort((a, b) => rank(b) - rank(a))) { if (added.length && added.reduce((s, q) => s + len(q), 0) >= amount * total) break; added.push(g); }
  const lines = [...own, ...added];
  return { image: pool.image, lines, inputKind: 'line-map', inkDecided: true,
    stats: { authored: own.length, poolKept: added.length, poolDropped: pool.lines.length - added.length, amount, lengthMm: Math.round(lines.reduce((s, g) => s + pathMm(g.points, pxMm), 0)) } };
}

/**
 * The flags that point the drawing at the pool file: no stage planner, a light opening pressure, and no planned-passage filter
 * (--lineedges 0: that filter leaves off a line inside one planned wash passage, and a pencil line under a wash is still drawing).
 * A flag the run already sets stays.
 */
export function graphiteDrawingArgs(argv, target) {
  const has = name => argv.includes(name);
  return ['--drawingfile', target, '--drawingstages', 'off', ...(has('--openingpressure') ? [] : ['--openingpressure', GRAPHITE_POOL_PRESSURE]), ...(has('--lineedges') ? [] : ['--lineedges', '0'])];
}

/**
 * Trace the pool, hold and decide it, merge the plan's opening lines, write <out>/graphite-lines.json and point the drawing at it.
 * Pushes --drawingfile, --drawingstages off and, if absent, --openingpressure onto argv. Throws when the models cannot run.
 */
export async function prepareGraphitePool({ opt, num, argv, out, root, image, sheetMm, log = () => {} }) {
  const lp = linePython({ flag: opt('sketchpython', ''), log });
  if (!lp.ready || !lp.model) throw new Error(`graphite drawing from the line model: ${lp.path} cannot run the lineart models (numpy, OpenCV, torch and controlnet_aux); run tools/cloud/setup-lines.sh, or pass --linemodel 0 to draw without them`);
  const stem = path.join(out, 'lines-graphite');
  const t = traceLineModel({ python: lp.path, root, image, stem, cacheDir: path.resolve(root, opt('linemodelcache', 'work/line-maps')), width: num('linemodelwidth', 1080), maxside: num('linemodelside', 1620),
    strokes: false, tolerance: opt('mapsmoothing', '') === '' ? null : num('mapsmoothing', 0.15), offline: num('linemodeloffline', 0) > 0, weights: path.resolve(root, opt('linemodelweights', 'work/line-models/hf')) });
  log(`graphite drawing: the line model's pool (${t.summary})`);
  // the pool is held and decided like an ink drawing's, with the pruning flags the run did not set
  const held = [];
  const get = n => (opt(n, null) ?? INK_HOLD_FLAGS[n] ?? null);
  const gopt = (n, d) => (n === 'drawingfile' ? stem : n === 'drawinglast' ? '' : (get(n) ?? d));
  const gnum = (n, d) => Number(gopt(n, d));
  const rec = await holdInkLines({ opt: gopt, num: gnum, argv: held, image, root, out, sheetMm, log });
  const pool = JSON.parse(fs.readFileSync(rec?.opening?.out ? linePaths(rec.opening.out).lines : `${stem}-lines.json`, 'utf8'));
  const own = opt('drawingfile', '') ? JSON.parse(readLineText(linePaths(path.resolve(root, opt('drawingfile', ''))).lines)) : null;
  // lines are ranked by length times the tone step across them: the budget goes to window and roof edges, not mortar joints
  const { w, h } = pool.image, { data, info } = await sharp(image).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer({ resolveWithObject: true });
  const L = labPlanes(data, info.width, info.height).L.map(v => 100 * v), pxMm = sheetMm / w;
  const merged = mergeAuthored(pool, own, { sheetMm, amount: num('prepamount', STAGE_DEFAULTS.prep.amount), score: g => pathMm(g.points, pxMm) * edgeStep(g, L, w, h, pxMm) });
  const target = path.join(out, 'graphite-lines');
  fs.writeFileSync(`${target}-lines.json`, JSON.stringify({ ...merged, medium: 'graphite' }) + '\n');
  fs.writeFileSync(path.join(out, 'graphite-pool.json'), JSON.stringify({ stem, pool: pool.lines.length, ...merged.stats }, null, 1) + '\n');
  argv.push(...graphiteDrawingArgs(argv, target));
  log(`graphite drawing: ${merged.lines.length} lines, ${merged.stats.lengthMm} mm, ${Math.round(100 * merged.stats.amount)}% of the length, strongest edges first, of ${pool.lines.length} pool lines held and decided by meaning${own ? `, ${merged.stats.authored} authored lines kept` : ''}`);
  return { ...merged.stats, file: `${target}-lines.json` };
}
