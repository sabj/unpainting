// Thin darks: the mirror of the final lights. A rim of glasses, a seam in a cap, a lid line, a strand of rigging, a dark
// whisker on pale fur: the subject draws them as dark lines a third to a half of a millimetre wide over a lighter ground, and
// the washes cannot lay a line that thin. They are found in the planning data by the thin lights' rules turned over
// (src/crop/thin-lights.mjs polarity 'dark': a ridge clearly darker than its ring in L*, long for its width, narrower than the
// wash planner can go round, each fitted with one smooth curve). Each line is then read as a drawn line is read
// (src/paint/methods/line-weight.mjs lineDarkness): its step, how many L* darker it is than its sides, and its width at half
// that depth. The step is what the finished sheet must show along the line; it is planned here, before the first wash.
//
// The lines are laid last, over the dry washes (tools/plate/thin-darks-lay.mjs), with the rigger's point as paint where the
// point can lay the line and with a pencil where it cannot. That choice needs the sheet and a swatch and is made there. A
// line the drawing layer already draws in ink, or in graphite at visible weight, is not planned twice. A strand inside a
// region labelled a coat is the coat's texture, and no line is planned there.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { thinLights, TOUCH_MM } from '../../src/crop/thin-lights.mjs';
import { paperDensity } from '../../src/crop/lights.mjs';
import { lineDarkness } from '../../src/paint/methods/line-weight.mjs';
import { labPlanes } from '../../src/paint/methods/line-evidence.mjs';
import { strokeCeiling } from '../guard/cheat-risk.mjs';

export const THIN_DARKS_PER_100_CM2 = 4;   // painted lines are few and structural: rims, seams, lids, rigging, whiskers
export const CANDIDATES_PER_PAINTED = 4;   // the lines planned in all, painted or pencilled, for each line that may be painted
const FINE_MAX = 2400, DRAWN_NEAR_MM = 0.8, DRAWN_SHARE = 0.5;

/** The lines the drawing layer draws at visible weight: ink always, graphite from `graphiteAmount` of full. Plan cells. */
export function drawnLines(files, { root, out, graphiteAmount = 0.3, visibleAmount = 0.5 }) {
  const lines = [], found = [];
  for (const [kind, file] of Object.entries(files ?? {})) {
    if (!file || typeof file !== 'string') continue;
    const candidates = [path.resolve(root, file), path.resolve(out, file), path.resolve(out, path.basename(file))], p = candidates.find(c => fs.existsSync(c));
    if (!p) continue;
    const visible = kind === 'prep' ? graphiteAmount >= visibleAmount : true;
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    found.push({ kind, lines: (doc.lines ?? []).length, visible });
    if (visible) for (const l of doc.lines ?? []) lines.push({ points: l.points, grid: doc.image });
  }
  return { lines, found };
}

/** A 0/1 plane over the plan grid: cells within `reachMm` of a drawn line. */
export function drawnMask(lines, w, h, mmPerCell, reachMm = DRAWN_NEAR_MM) {
  const mask = new Uint8Array(w * h), r = Math.max(1, Math.round(reachMm / mmPerCell));
  for (const l of lines) {
    const sx = w / (l.grid?.w ?? w), sy = h / (l.grid?.h ?? h);
    for (let k = 0; k < l.points.length; k++) {
      const a = l.points[Math.max(0, k - 1)], b = l.points[k], n = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * sx, (b[1] - a[1]) * sy)));
      for (let t = 0; t <= n; t++) { const x = (a[0] + (b[0] - a[0]) * t / n) * sx, y = (a[1] + (b[1] - a[1]) * t / n) * sy;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = Math.round(x) + dx, yy = Math.round(y) + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && dx * dx + dy * dy <= r * r) mask[yy * w + xx] = 1; } }
    }
  }
  return mask;
}

/**
 * @param coat     { mask } over the plan grid: the regions labelled coats, where no line is planned
 * @param drawn    the drawing layer's visible lines, as drawnLines gives them
 * @returns {{ strokes, record }} strokes in plan cells, best first, each with the line's own colour, its step in L* over
 *   its sides (`step`, with the sides' own L* as `sideL`) and its widths (`measuredMm` by area, `halfMm` at half depth)
 */
export async function planThinDarks({ image, w, h, sheetMm, paperRGB, crop = null, coat = null, drawn = [] }) {
  let src = sharp(image).flatten({ background: '#ffffff' });
  if (crop) src = src.extract({ left: Math.round(crop[0]), top: Math.round(crop[1]), width: Math.round(crop[2]), height: Math.round(crop[3]) });
  const meta = crop ? { width: Math.round(crop[2]) } : await sharp(image).metadata();
  const { data, info } = await src.resize({ width: Math.min(FINE_MAX, 2 * w, meta.width), withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelMm = sheetMm / info.width, sheetCm2 = sheetMm * (sheetMm * info.height / info.width) / 100, cellMm = sheetMm / w;
  const paintedMax = Math.max(1, Math.round(THIN_DARKS_PER_100_CM2 * sheetCm2 / 100)), max = CANDIDATES_PER_PAINTED * paintedMax;
  const record = { stage: 'planning, before the first wash', rule: `a ridge clearly darker than its ring in L*, long for its width, narrower than ${TOUCH_MM} mm; its step and width read as a drawn line's are`, paintedMax, max };
  const D = paperDensity(data, info.width * info.height, paperRGB);
  const planMask = m => m ? (x, y) => m[Math.min(h - 1, Math.floor(y * h / info.height)) * w + Math.min(w - 1, Math.floor(x * w / info.width))] === 1 : null;
  const inCoat = planMask(coat?.mask), found = thinLights(D, info.width, info.height, { pixelMm, rgb: data, strokesMax: max, glintsMax: 0, skip: inCoat, polarity: 'dark' });
  const drawnPlane = drawn.length ? drawnMask(drawn, w, h, cellMm) : null;
  const near = s => { if (!drawnPlane) return false; let hit = 0; for (const [x, y] of s.points) if (drawnPlane[Math.min(h - 1, Math.floor(y * h / info.height)) * w + Math.min(w - 1, Math.floor(x * w / info.width))]) hit++; return hit / s.points.length >= DRAWN_SHARE; };
  const L = labPlanes(data, info.width, info.height).L.map(v => 100 * v), kept = [];
  let alreadyDrawn = 0;
  for (const s of found.strokes) {
    if (near(s)) { alreadyDrawn++; continue; }
    const d = lineDarkness(s.points, L, info.width, info.height, pixelMm);
    kept.push({ ...s, step: d.drop, sideL: d.side, halfMm: Number.isFinite(d.widthMm) ? d.widthMm : s.measuredMm });
  }
  const sx = w / info.width, sy = h / info.height, r2 = v => +v.toFixed(2);
  const strokes = kept.map(s => ({ kind: 'dark-line', curve: s.points.map(([x, y]) => [x * sx, y * sy]), measuredMm: +s.measuredMm.toFixed(3), halfMm: +s.halfMm.toFixed(3), step: r2(s.step), sideL: r2(s.sideL), lengthMm: r2(s.lengthMm), od: +s.lightOd.toFixed(3), rgb: s.rgb, fit: s.fit }));
  const lengthMm = strokes.reduce((a, s) => a + s.lengthMm, 0), steps = strokes.map(s => s.step).sort((a, b) => a - b);
  return { strokes, record: { ...record, decision: strokes.length ? 'lay' : 'none', read: { fineWidth: info.width, pixelMm: +pixelMm.toFixed(4) }, found: found.stats, candidates: found.strokes.length, skippedAlreadyDrawn: alreadyDrawn,
    planned: { strokes: strokes.length, lengthMm: +lengthMm.toFixed(1), stepMedian: steps.length ? steps[steps.length >> 1] : null, shareOfCeiling: +(strokes.length / strokeCeiling(sheetMm, sheetMm * info.height / info.width)).toFixed(4) }, cellMm: +cellMm.toFixed(3) } };
}
