// Thin darks: the mirror of the final lights. A rim of glasses, a seam in a cap, a lid line, a strand of rigging, a dark
// whisker on pale fur: the subject draws them as dark lines a third to a half of a millimetre wide over a lighter ground, and
// the washes cannot lay a line that thin. They are found in the planning data by the thin lights' rules turned over
// (src/crop/thin-lights.mjs polarity 'dark': a ridge clearly darker than its ring in L*, long for its width, narrower than the
// wash planner can go round, each fitted with one smooth curve), and laid last with the rigger's point as real paint
// (tools/plate/thin-darks-lay.mjs).
//
// The scale rule is the coat texture's: a line is laid only where the point's measured line (src/paint/methods/brush-swatch.mjs
// measurePoint, at this run's density) is within SCALE_LIMIT times the subject's own line. A line the drawing layer already
// draws, in ink or in graphite at visible weight, is not laid twice. A strand inside a region labelled a coat is the coat's
// texture, and no line is laid there. The decision is a rule, made from the planning data before the first wash.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { thinLights, TOUCH_MM } from '../../src/crop/thin-lights.mjs';
import { paperDensity } from '../../src/crop/lights.mjs';
import { SCALE_LIMIT } from '../../src/paint/methods/brush-swatch.mjs';
import { strokeCeiling } from '../guard/cheat-risk.mjs';

export const THIN_DARKS_PER_100_CM2 = 4;   // few and structural: rims, seams, lids, rigging, whiskers
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
 * @param swatch   measurePoint at the plan's density, or null when it could not be measured (nothing is laid)
 * @param coat     { mask } over the plan grid: the regions labelled coats, where no line is laid
 * @param drawn    the drawing layer's visible lines, as drawnLines gives them
 * @returns {{ strokes, record }} strokes in plan cells, with the line's own colour and width
 */
export async function planThinDarks({ image, w, h, sheetMm, paperRGB, crop = null, swatch, coat = null, drawn = [] }) {
  let src = sharp(image).flatten({ background: '#ffffff' });
  if (crop) src = src.extract({ left: Math.round(crop[0]), top: Math.round(crop[1]), width: Math.round(crop[2]), height: Math.round(crop[3]) });
  const meta = crop ? { width: Math.round(crop[2]) } : await sharp(image).metadata();
  const { data, info } = await src.resize({ width: Math.min(FINE_MAX, 2 * w, meta.width), withoutEnlargement: true }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelMm = sheetMm / info.width, sheetCm2 = sheetMm * (sheetMm * info.height / info.width) / 100, cellMm = sheetMm / w;
  const record = { stage: 'planning, before the first wash', rule: `a ridge clearly darker than its ring in L*, long for its width, narrower than ${TOUCH_MM} mm; laid only where the point's measured line is within ${SCALE_LIMIT} times the subject's line`, scaleLimit: SCALE_LIMIT, point: swatch ? { lineMm: swatch.widthMm, coreMm: swatch.coreMm, stable: swatch.stable, rows: swatch.rows, settings: swatch.settings } : null };
  if (!swatch?.stable) return { strokes: [], record: { ...record, decision: 'none', reason: 'no stable line measured for the point: nothing laid' } };
  const D = paperDensity(data, info.width * info.height, paperRGB), max = Math.max(1, Math.round(THIN_DARKS_PER_100_CM2 * sheetCm2 / 100));
  const planMask = m => m ? (x, y) => m[Math.min(h - 1, Math.floor(y * h / info.height)) * w + Math.min(w - 1, Math.floor(x * w / info.width))] === 1 : null;
  const inCoat = planMask(coat?.mask), found = thinLights(D, info.width, info.height, { pixelMm, rgb: data, strokesMax: 4 * max, glintsMax: 0, skip: inCoat, polarity: 'dark' });
  const drawnPlane = drawn.length ? drawnMask(drawn, w, h, cellMm) : null;
  const near = s => { if (!drawnPlane) return false; let hit = 0; for (const [x, y] of s.points) if (drawnPlane[Math.min(h - 1, Math.floor(y * h / info.height)) * w + Math.min(w - 1, Math.floor(x * w / info.width))]) hit++; return hit / s.points.length >= DRAWN_SHARE; };
  const kept = [], drop = { alreadyDrawn: 0, tooFine: 0 };
  for (const s of found.strokes) {
    if (near(s)) { drop.alreadyDrawn++; continue; }
    if (swatch.widthMm > SCALE_LIMIT * s.measuredMm) { drop.tooFine++; continue; }
    kept.push(s);
  }
  const sx = w / info.width, sy = h / info.height, strokes = kept.slice(0, max).map(s => ({ kind: 'dark-line', curve: s.points.map(([x, y]) => [x * sx, y * sy]), measuredMm: +s.measuredMm.toFixed(3), lengthMm: +s.lengthMm.toFixed(2), od: +s.lightOd.toFixed(3), rgb: s.rgb, fit: s.fit }));
  const lengthMm = strokes.reduce((a, s) => a + s.lengthMm, 0);
  return { strokes, record: { ...record, decision: strokes.length ? 'lay' : 'none', read: { fineWidth: info.width, pixelMm: +pixelMm.toFixed(4) }, found: found.stats, candidates: found.strokes.length, skippedAlreadyDrawn: drop.alreadyDrawn, skippedTooFine: drop.tooFine, planned: { strokes: strokes.length, lengthMm: +lengthMm.toFixed(1), max, shareOfCeiling: +(strokes.length / strokeCeiling(sheetMm, sheetMm * info.height / info.width)).toFixed(4) }, cellMm: +cellMm.toFixed(3) } };
}
