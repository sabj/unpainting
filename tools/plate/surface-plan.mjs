// Surface marks on an unplanned run: the planning step that chooses, for each region, the marks its surface asks for.
// A vision judge labels the SAM regions (src/paint/methods/surface-labels.mjs); a coat label asks for a coat's texture
// (short-coat, curly-coat or long-hair: dry-brush strokes along the strands the subject shows, src/crop/coat-texture.mjs),
// dressed stone asks for masonry marks, and everything else, and every doubt, asks for none. A wall's courses lie along the
// region's dominant level direction. Density follows value: more marks where the source is darker, none in its lights.
// A plan's own marks win: an area plan has none of this.
// Planning only; the paint step reads no target. The judge, its model and every label are recorded for the run card.
import fs from 'node:fs';
import path from 'node:path';
import { loadSegments, registerSegments } from '../../src/crop/segments.mjs';
import { labelSurfaces, SURFACE_KIND } from '../../src/paint/methods/surface-labels.mjs';
import { surfaceMarkPaths } from '../../src/paint/techniques/surface-marks.mjs';
import { orientationField } from '../../src/crop/fur.mjs';
import { gaussian } from '../../src/keyframes/density.mjs';
import { coatTexture } from '../../src/crop/coat-texture.mjs';
import { strokeCeiling } from '../guard/cheat-risk.mjs';

// The brush a kind is laid with, in mm: a small round for a coat, a flat for a block of stone.
export const BRUSH_MM = Object.freeze({ 'short-coat': 1.0, 'curly-coat': 1.0, 'long-hair': 1.2, masonry: 2.5 });
// The share of the candidate places in a region a kind visits: a painter hints a coat or a wall, she does not draw it.
export const COVER = Object.freeze({ 'short-coat': 0.35, 'curly-coat': 0.3, 'long-hair': 0.25, masonry: 0.2 });
export const SURFACE_CEILING_SHARE = 0.1;
export const COAT_CEILING_SHARE = 0.1;
const LIGHT_OD = 0.35, FULL_OD = 1.25; // no mark in a light; the most marks where the source is this dense or more

/** The marks for labelled regions, from a label map, the kinds the labels ask for, and the source's density. Pure. */
export function surfaceMarksFor({ labelMap, kinds, labels, SRC, w, h, sheetMm, ceiling = Infinity }) {
  const O = orientationField(SRC, w, h, gaussian, { sigma: 2 }), mmPerCell = sheetMm / w;
  const weight = Float32Array.from(SRC, d => Math.max(0, Math.min(1, (d - LIGHT_OD) / (FULL_OD - LIGHT_OD))));
  const flowAt = (x, y) => { const i = Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x))); return [O.dx[i], O.dy[i]]; };
  const groups = [], coatMask = new Uint8Array(w * h);
  for (const [id, kind] of Object.entries(kinds)) {
    const mask = new Uint8Array(w * h); let cells = 0, c2 = 0, s2 = 0;
    for (let i = 0; i < w * h; i++) if (labelMap[i] === Number(id)) { mask[i] = 1; cells++; if (kind !== 'masonry') coatMask[i] = 1; const a = Math.atan2(O.dy[i], O.dx[i]); c2 += O.coherence[i] * Math.cos(2 * a); s2 += O.coherence[i] * Math.sin(2 * a); }
    if (!cells) continue;
    let course = 0.5 * Math.atan2(s2, c2) * 180 / Math.PI; // the dominant direction, -90 to 90
    course = Math.max(-45, Math.min(45, course));
    const marks = { kind, reason: labels[id], cover: COVER[kind], placement: 'whole', ...(kind === 'masonry' ? { courseAngleDeg: course } : {}) };
    const paths = surfaceMarkPaths(marks, { mask, w, h, mmPerCell, brushMm: BRUSH_MM[kind], scale: 1, seedKey: `region${id}`, flowAt, weight });
    groups.push({ id: Number(id), kind, label: labels[id], areaShare: +(cells / (w * h)).toFixed(4), brushMm: BRUSH_MM[kind], courseAngleDeg: kind === 'masonry' ? +course.toFixed(1) : null, paths });
  }
  // under the ceiling: every k-th mark, so a crowded sheet keeps its spread
  const total = groups.reduce((a, g) => a + g.paths.length, 0);
  if (total > ceiling) { const k = Math.ceil(total / ceiling); for (const g of groups) g.paths = g.paths.filter((_, i) => i % k === 0); }
  return { groups, coatMask };
}

/** Labels the run's regions with the judge and plans the marks and the coats' texture; the record is for the run card and the log. */
export async function planSurface({ image, root, w, h, sheetMm, segments, SRC, rgb, judge = 'codex', cacheDir, env = process.env, run, log = () => {} }) {
  const unavailable = reason => { log(`! surface marks: ${reason}; no surface marks, no coat texture and no coat strokes are laid`); return { groups: [], coat: { strokes: [], regions: [] }, coatMask: new Uint8Array(w * h), record: { status: 'unavailable', reason, judge, marks: 0 } }; };
  if (!segments?.stem) return unavailable('no SAM regions (--segments off), so no region can be labelled');
  const base = path.basename(image, path.extname(image));
  registerSegments(base, segments.stem);
  const seg = await loadSegments(base, w, h), doc = JSON.parse(fs.readFileSync(`${segments.stem}.json`, 'utf8'));
  const regions = doc.regions.map(r => ({ ...r, id: Number(r.id) }));
  const lab = await labelSurfaces({ image, regions, labelMap: seg.labels, w, h, judge, cacheDir, env, ...(run ? { run } : {}) });
  if (lab.status !== 'ok') return unavailable(`the ${judge} judge could not label the regions (${lab.reason})`);
  const sheetHeightMm = sheetMm * h / w, strokeMax = strokeCeiling(sheetMm, sheetHeightMm), ceiling = Math.floor(SURFACE_CEILING_SHARE * strokeMax);
  const stone = Object.fromEntries(Object.entries(lab.kinds).filter(([, k]) => k === 'masonry')), coats = Object.fromEntries(Object.entries(lab.kinds).filter(([, k]) => k !== 'masonry'));
  const { groups } = surfaceMarksFor({ labelMap: seg.labels, kinds: stone, labels: lab.labels, SRC, w, h, sheetMm, ceiling });
  const coat = coatTexture({ D: SRC, rgb, labelMap: seg.labels, kinds: coats, w, h, mmPerCell: sheetMm / w, ceiling: Math.floor(COAT_CEILING_SHARE * strokeMax) });
  const coatMask = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) if (coats[seg.labels[i]]) coatMask[i] = 1;
  const byKind = {}; for (const g of groups) byKind[g.kind] = (byKind[g.kind] ?? 0) + g.paths.length;
  const count = groups.reduce((a, g) => a + g.paths.length, 0);
  const record = {
    status: 'ok', judge: lab.judge, model: lab.model, cached: lab.cached, stage: 'planning, before the first wash',
    labels: Object.fromEntries(Object.entries(lab.labels).map(([id, l]) => [id, { label: l, kind: SURFACE_KIND[l] ?? null }])),
    regions: groups.map(g => ({ id: g.id, label: g.label, kind: g.kind, areaShare: g.areaShare, brushMm: g.brushMm, courseAngleDeg: g.courseAngleDeg, marks: g.paths.length })),
    marks: count, byKind, ceiling, cover: COVER, lightOd: LIGHT_OD,
    coats: coat.regions, coatStrokes: coat.strokes.length, coatCeiling: Math.floor(COAT_CEILING_SHARE * strokeMax),
  };
  log(`surface labels (${lab.judge} ${lab.model ?? ''}${lab.cached ? ', cached' : ''}): ${Object.keys(lab.labels).length} regions; ${Object.keys(coats).length} coats (${coat.strokes.length} dry-brush strokes planned: ${coat.regions.map(r => `region ${r.id} ${r.kind} ${r.lightStrokes ?? 0} light ${r.darkStrokes ?? 0} dark`).join('; ') || 'none'}); ${Object.keys(stone).length} dressed stone (${count} marks)`);
  return { groups, coat, coatMask, record };
}
