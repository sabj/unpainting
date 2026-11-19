// Surface marks on an unplanned run: the planning step that chooses, for each region, the marks its surface asks for.
// A vision judge labels the SAM regions (src/paint/methods/surface-labels.mjs); a coat label asks for short-coat,
// curly-coat or long-hair marks, dressed stone asks for masonry, and everything else, and every doubt, asks for none.
// Direction follows the form: a coat's marks lie along the structure of the source at the scale of a few hairs
// (src/crop/fur.mjs orientationField), and a wall's courses along the region's dominant level direction. Density follows
// value: more marks where the source is darker, none in its lights. A plan's own marks win: an area plan has none of this.
// Planning only; the paint step reads no target. The judge, its model and every label are recorded for the run card.
import fs from 'node:fs';
import path from 'node:path';
import { loadSegments, registerSegments } from '../../src/crop/segments.mjs';
import { labelSurfaces, SURFACE_KIND } from '../../src/paint/methods/surface-labels.mjs';
import { surfaceMarkPaths } from '../../src/paint/techniques/surface-marks.mjs';
import { orientationField } from '../../src/crop/fur.mjs';
import { gaussian } from '../../src/keyframes/density.mjs';
import { strokeCeiling } from '../guard/cheat-risk.mjs';

// The brush a kind is laid with, in mm: a small round for a coat, a flat for a block of stone.
export const BRUSH_MM = Object.freeze({ 'short-coat': 1.0, 'curly-coat': 1.0, 'long-hair': 1.2, masonry: 2.5 });
// The share of the candidate places in a region a kind visits: a painter hints a coat or a wall, she does not draw it.
export const COVER = Object.freeze({ 'short-coat': 0.35, 'curly-coat': 0.3, 'long-hair': 0.25, masonry: 0.2 });
export const SURFACE_CEILING_SHARE = 0.1;
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

/** Labels the run's regions with the judge and plans the marks; the record is for the run card and the log. */
export async function planSurface({ image, root, w, h, sheetMm, segments, SRC, judge = 'codex', cacheDir, env = process.env, run, log = () => {} }) {
  const unavailable = reason => { log(`! surface marks: ${reason}; no surface marks and no coat strokes are laid`); return { groups: [], coatMask: new Uint8Array(w * h), record: { status: 'unavailable', reason, judge, marks: 0 } }; };
  if (!segments?.stem) return unavailable('no SAM regions (--segments off), so no region can be labelled');
  const base = path.basename(image, path.extname(image));
  registerSegments(base, segments.stem);
  const seg = await loadSegments(base, w, h), doc = JSON.parse(fs.readFileSync(`${segments.stem}.json`, 'utf8'));
  const regions = doc.regions.map(r => ({ ...r, id: Number(r.id) }));
  const lab = await labelSurfaces({ image, regions, labelMap: seg.labels, w, h, judge, cacheDir, env, ...(run ? { run } : {}) });
  if (lab.status !== 'ok') return unavailable(`the ${judge} judge could not label the regions (${lab.reason})`);
  const sheetHeightMm = sheetMm * h / w, ceiling = Math.floor(SURFACE_CEILING_SHARE * strokeCeiling(sheetMm, sheetHeightMm));
  const { groups, coatMask } = surfaceMarksFor({ labelMap: seg.labels, kinds: lab.kinds, labels: lab.labels, SRC, w, h, sheetMm, ceiling });
  const byKind = {}; for (const g of groups) byKind[g.kind] = (byKind[g.kind] ?? 0) + g.paths.length;
  const count = groups.reduce((a, g) => a + g.paths.length, 0);
  const record = {
    status: 'ok', judge: lab.judge, model: lab.model, cached: lab.cached, stage: 'planning, before the first wash',
    labels: Object.fromEntries(Object.entries(lab.labels).map(([id, l]) => [id, { label: l, kind: SURFACE_KIND[l] ?? null }])),
    regions: groups.map(g => ({ id: g.id, label: g.label, kind: g.kind, areaShare: g.areaShare, brushMm: g.brushMm, courseAngleDeg: g.courseAngleDeg, marks: g.paths.length })),
    marks: count, byKind, ceiling, cover: COVER, lightOd: LIGHT_OD,
  };
  log(`surface labels (${lab.judge} ${lab.model ?? ''}${lab.cached ? ', cached' : ''}): ${groups.length} of ${Object.keys(lab.labels).length} regions take marks, ${count} marks (${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'})`);
  return { groups, coatMask, record };
}
