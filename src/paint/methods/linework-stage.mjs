// The universal linework stage (--linework auto, plan drawing.linework "auto"): one stage every style uses, before the
// first mark and before the target guard seals the target.
//
//   1. Line source, first that holds:
//        sketch  an image model's pen sketch of this target from the sketch cache (tools/seg/sketch-target.mjs, keyed by
//                the target's SHA-256), copied at its observed widths and accepted only if it passes the geometry check
//                (sketch-check.mjs): registered to the target's edges, invented lines dropped, kept lines snapped
//        sketch planner  the target's structure as hierarchical pen strokes with width and pressure cues
//                (tools/seg/sketch-lines.py, the photo-sketch source), when python has numpy and OpenCV
//        trace   else the target's observed dark ridges (src/crop/ink-lines-file.mjs)
// Lines are copied at twice the plan grid, so a fine pen line keeps its measured width on the sheet.
//   2. Cleanup (line-cleanup.mjs): specks, shadow and value edges, the structure filter on a trace, repeated small
//      marks pruned into rhythm, weight hierarchy; points keep their widths and wobble.
//   3. Gate (line-gate.mjs): draw or not, ink or graphite, how much. An explicit medium wins.
//   4. Usage by style: pen and wash keeps the lines dominant, every other style keeps them light (--lineweight).
// Writes <out>/lines-universal-lines.json (an ordinary --drawingfile) and <out>/linework-stage.json, and returns the
// painter flags that point the pens at it. Every later route (linked stages, the pen-and-wash prune, the opening and
// closing pens) reads that file as it would any prepared drawing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { gaussian } from '../../keyframes/density.mjs';
import { scaleLines } from '../../crop/lines.mjs';
import { writeInkLines } from '../../crop/ink-lines-file.mjs';
import { separate } from '../../crop/inkwash.mjs';
import { paperOf } from '../../crop/palettepick.mjs';
import { edgeEvidence } from './line-evidence.mjs';
import { checkSketch } from './sketch-check.mjs';
import { cleanLines } from './line-cleanup.mjs';
import { straightShare, decideLinework } from './line-gate.mjs';

const MEDIA = Object.freeze(['ink', 'graphite', 'none']);
// How heavily each style uses the lines: pen and wash states the drawing, the others keep it light under the washes.
export const STYLE_WEIGHT = Object.freeze({ penwash: 1, default: 1 });

const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const pathLength = pts => { let d = 0; for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return d; };

/** Whether python has numpy and OpenCV. */
function pythonReady(python) {
  if (!python) return false;
  const r = spawnSync(python, ['-c', 'import cv2, numpy'], { encoding: 'utf8', timeout: 60000 });
  return !r.error && r.status === 0;
}

// Observed dark lines of an image as a line file at `width`: copy-lines.py when it can run, else the JS tracer.
async function copyLines(image, stem, { width, python, root }) {
  if (pythonReady(python)) { runPython(python, [path.join(root, 'tools/seg/copy-lines.py'), image, '--out', stem, '--width', String(width)], 'copy-lines'); return 'copy-lines'; }
  await writeInkLines(image, stem, { width });
  return 'ink-lines (numpy/OpenCV unavailable)';
}

function runPython(python, args, name) {
  const r = spawnSync(python, args, { encoding: 'utf8', timeout: 900000, env: { ...process.env, OMP_NUM_THREADS: '2', OPENBLAS_NUM_THREADS: '2' } });
  if (r.error || r.status !== 0) throw new Error(`${name} failed: ${r.error?.message ?? r.stderr}`);
  return r.stdout;
}

/** Keep the strongest lines within `budgetMm` of ink (long, heavy lines first), in their own order. */
export function withinBudget(lines, budgetMm, mmPerCell) {
  const ranked = lines.map((g, i) => ({ i, mm: pathLength(g.points) * mmPerCell, s: pathLength(g.points) * (g.weight ?? 1) })).sort((a, b) => b.s - a.s || a.i - b.i);
  const keep = new Set(); let used = 0;
  for (const r of ranked) { if (used + r.mm > budgetMm && keep.size) continue; keep.add(r.i); used += r.mm; }
  return lines.filter((_, i) => keep.has(i));
}

const toFile = (lines, w, h, extra) => ({
  ...extra, image: { w, h },
  lines: lines.map(g => ({
    points: g.points.map(q => [+q.x.toFixed(2), +q.y.toFixed(2)]),
    ...(g.points.every(q => q.width != null) ? { widths: g.points.map(q => +q.width.toFixed(3)) } : {}),
    ...(g.points.every(q => q.weight != null) ? { weights: g.points.map(q => +q.weight.toFixed(3)) } : {}),
    ...(g.weight != null ? { weight: +g.weight.toFixed(3) } : {}), ...(g.role ? { role: g.role } : {}),
  })),
});

/**
 * Plan the drawing. `requested` an explicit medium or null; `style` 'penwash' or another name; `python` the
 * interpreter for copy-lines; `sketchCache` the directory of image-model sketches.
 * @returns { flags, record }
 */
export async function planUniversalLinework({ image, out, root, width, sheetMm, requested = null, style = 'default', python = null, sketchCache = null, seed = 0, log = () => {} }) {
  if (requested && !MEDIA.includes(requested)) throw new Error(`--linemedium: ${MEDIA.join(', ')}, not ${requested}`);
  const bytes = fs.readFileSync(image), sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const { data: rgb, info } = await sharp(bytes).flatten({ background: '#ffffff' }).resize({ width }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, n = w * h, mmPerCell = sheetMm / w;
  // the outer 4% is left out, as the pens leave it: a scan's mount and border are not the picture's edges
  const ev = edgeEvidence(rgb, w, h, { margin: Math.max(2, Math.round(0.04 * Math.min(w, h))) });
  const target = { w, h, L: ev.smooth[0], A: ev.smooth[1], B: ev.smooth[2], rgb: [0, 1, 2].map(c => gaussian(Float32Array.from({ length: n }, (_, i) => lin(rgb[3 * i + c])), w, h, 1)) };
  const { paperRGB } = paperOf(rgb, w, h, { mode: 'source' });
  const features = { straight: straightShare(ev.edge, w, h, { mmPerCell }), penLine: separate(rgb, w, h, paperRGB).stats.ink / n };
  const record = { stage: 'universal linework', targetSHA256: sha, grid: { w, h }, mmPerCell: +mmPerCell.toFixed(5), style, sources: [] };
  fs.mkdirSync(out, { recursive: true });
  let chosen = null;
  const sketchFile = sketchCache ? path.join(sketchCache, `${sha}.png`) : null;
  if (sketchFile && fs.existsSync(sketchFile)) {
    const stem = path.join(out, 'lines-sketch');
    const copier = await copyLines(sketchFile, stem, { width: 2 * width, python, root });
    const raw = scaleLines(JSON.parse(fs.readFileSync(`${stem}-lines.json`, 'utf8')), w, h, { keepOrder: true });
    const c = checkSketch(raw, ev, { mmPerCell, blur: gaussian, dark: Float32Array.from(target.L, v => 1 - v) });
    const sketchSHA = crypto.createHash('sha256').update(fs.readFileSync(sketchFile)).digest('hex');
    record.sources.push({ source: 'sketch', sketchSHA256: sketchSHA, copier, accepted: c.accepted, why: c.why, stats: c.stats, transform: c.transform });
    log(`linework: image-model sketch ${c.accepted ? 'accepted' : 'rejected'}: ${c.accepted ? `${(100 * c.stats.matched).toFixed(0)}% of its ink on the target's edges, ${c.stats.inventedLines} invented lines dropped` : c.why.join('; ')}`);
    if (c.accepted) chosen = { source: 'sketch', lines: c.lines, trace: false };
  } else record.sources.push({ source: 'sketch', accepted: false, why: [sketchCache ? 'no cached sketch for this target' : 'no sketch cache'] });
  if (!chosen && pythonReady(python)) {
    const stem = path.join(out, 'lines-planner');
    runPython(python, [path.join(root, 'tools/seg/sketch-lines.py'), image, '--out', stem, '--width', String(2 * width)], 'sketch-lines');
    const raw = scaleLines(JSON.parse(fs.readFileSync(`${stem}-lines.json`, 'utf8')), w, h, { keepOrder: true });
    record.sources.push({ source: 'sketch planner', lines: raw.length, accepted: true });
    chosen = { source: 'sketch planner', lines: raw, trace: false };
  }
  if (!chosen) {
    const stem = path.join(out, 'lines-trace');
    await writeInkLines(image, stem, { width: 2 * width });
    const raw = scaleLines(JSON.parse(fs.readFileSync(`${stem}-lines.json`, 'utf8')), w, h, { keepOrder: true });
    record.sources.push({ source: 'trace', copier: 'ink-lines', lines: raw.length, accepted: true });
    chosen = { source: 'trace', lines: raw, trace: true };
  }
  const clean = cleanLines(chosen.lines, target, { mmPerCell, trace: chosen.trace, seed: 1 + seed });
  const areaCm2 = (w * mmPerCell / 10) * (h * mmPerCell / 10), inkMm = clean.lines.reduce((a, g) => a + pathLength(g.points) * mmPerCell, 0);
  const gate = decideLinework({ ...features, density: inkMm / areaCm2, sketch: chosen.source === 'sketch' }, { requested });
  const usage = (STYLE_WEIGHT[style] ?? STYLE_WEIGHT.default) * gate.weight;
  const kept = gate.draw ? withinBudget(clean.lines, gate.budget * areaCm2, mmPerCell) : [];
  const lines = kept.map(g => ({ ...g, weight: (g.weight ?? 1) * usage, points: g.points.map(q => ({ ...q, weight: (q.weight ?? 1) * usage })) }));
  Object.assign(record, { source: chosen.source, features: Object.fromEntries(Object.entries(features).map(([k, v]) => [k, +v.toFixed(4)])), cleanup: clean.stats,
    inkMmPerCm2: +(inkMm / areaCm2).toFixed(2), gate: { ...gate, usage: +usage.toFixed(3) }, lines: lines.length,
    drawnMmPerCm2: +(lines.reduce((a, g) => a + pathLength(g.points) * mmPerCell, 0) / areaCm2).toFixed(2) });
  fs.writeFileSync(path.join(out, 'linework-stage.json'), JSON.stringify(record, null, 2) + '\n');
  log(`linework: ${gate.draw ? `${lines.length} lines in ${gate.medium} from the ${chosen.source}` : 'no lines'} (${gate.why.join('; ')})`);
  if (!gate.draw) return { flags: ['--drawing', 'none'], record };
  const stem = path.join(out, 'lines-universal');
  fs.writeFileSync(`${stem}-lines.json`, JSON.stringify(toFile(lines, w, h, { source: `universal linework: ${chosen.source}`, targetSHA256: sha })) + '\n');
  const flags = ['--drawingfile', stem];
  if (gate.chosen) flags.push('--outlinemedium', gate.medium);
  return { flags, record };
}
