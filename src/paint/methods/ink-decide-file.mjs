// Pipeline: inking, stage 2 (hold and measure the lines): the ink-or-wash decision applied to a line file.
// Labels the target's SAM regions (ink-labels.mjs), decides every candidate line (ink-decide.mjs), and writes
// <out>/ink-labels.json next to the painting: each region's label and ink rule, where the label came from, and what was
// cut and why. Planning only: it reads the target before the first mark.
import fs from 'node:fs';
import path from 'node:path';
import { loadSegments, registerSegments } from '../../crop/segments.mjs';
import { labelRegions, shadowMassMask, INK_RULES, LABELS } from './ink-labels.mjs';
import { decideLines, DECIDE_DEFAULTS } from './ink-decide.mjs';
import { geometrise, GEOM_DEFAULTS } from './line-geometry.mjs';
import { foliageMask } from './line-foliage.mjs';
import { hatchShadows, HATCH_DEFAULTS } from './line-hatch.mjs';
import { salience } from './line-salience.mjs';
import { labPlanes } from './line-evidence.mjs';
import sharp from 'sharp';

const toPoints = g => g.points.map(([x, y], k) => ({ x, y, ...(Array.isArray(g.widths) && g.widths.length === g.points.length ? { width: g.widths[k] } : {}), ...(Array.isArray(g.weights) && g.weights.length === g.points.length ? { weight: g.weights[k] } : {}) }));
const r2 = v => Math.round(v * 100) / 100;
function fromPoints(g, pts) {
  const { widths: _w, weights: _g, ...rest } = g;
  return { ...rest, points: pts.map(p => [r2(p.x), r2(p.y)]), ...(pts.every(p => p.width != null) ? { widths: pts.map(p => r2(p.width)) } : {}), ...(pts.every(p => p.weight != null) ? { weights: pts.map(p => r2(p.weight)) } : {}) };
}

/**
 * Decide the lines of `doc` (a line file, on grid `doc.image`). `segments` is prepareSegments' record ({ stem }).
 * @returns { lines, record } the lines kept (line-file form) and the record written to ink-labels.json
 */
export async function decideFile({ doc, L, image, out, stage, pxMm, segments, judge = 'codex', cacheDir, log = () => {}, o = DECIDE_DEFAULTS, run, geom = false, geomOptions = GEOM_DEFAULTS, shadowMask = true, foliage = false, hatch = null, salient = false }) {
  const { w, h } = doc.image, base = path.basename(image, path.extname(image));
  registerSegments(base, segments.stem);
  const seg = await loadSegments(base, w, h), segDoc = JSON.parse(fs.readFileSync(`${segments.stem}.json`, 'utf8'));
  const regions = segDoc.regions.map(r => ({ ...r, id: Number(r.id) }));
  const lab = await labelRegions({ image, regions, labelMap: seg.labels, w, h, judge, cacheDir, segKey: path.basename(segments.stem), log, ...(run ? { run } : {}) });
  const shadow = shadowMask ? shadowMassMask(L, w, h, pxMm) : new Uint8Array(w * h);
  // --inkfoliage 1: green, busy cells are leaves, wash only (line-foliage.mjs), whatever the regions' labels say
  let foliageCells = null;
  if (foliage) {
    const rgb = await sharp(image).flatten({ background: '#fff' }).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer(), lab = labPlanes(rgb, w, h);
    foliageCells = foliageMask(L, lab.A, lab.B, w, h, pxMm);
  }
  const cellLabel = (x, y) => lab.labels[seg.labels[y * w + x]] ?? 'architecture';
  const r = decideLines(doc.lines.map(g => ({ ...g, points: toPoints(g) })), { L, w, h, pxMm, cellLabel, shadow, foliage: foliageCells }, o);
  let kept = r.lines, geometry = null;
  // --inkgeom 1: straight runs and arcs where the source shows them; squiggles that are not forms or features are left to the wash
  if (geom) {
    const isFeature = (x, y) => ['face', 'hands'].includes(cellLabel(Math.max(0, Math.min(w - 1, Math.round(x))), Math.max(0, Math.min(h - 1, Math.round(y)))));
    const gres = geometrise(kept, { L, w, h, pxMm, isFeature }, geomOptions);
    kept = gres.lines; geometry = gres.stats;
  }
  // --inksalience 1: connected and closed geometry first; a short isolated piece that belongs to no form is left to the wash
  let sal = null;
  if (salient) {
    const isF = (x, y) => ['face', 'hands'].includes(cellLabel(Math.max(0, Math.min(w - 1, Math.round(x))), Math.max(0, Math.min(h - 1, Math.round(y)))));
    const sres = salience(kept, { pxMm, isFeature: isF }); kept = sres.lines; sal = sres.stats;
  }
  // --inkhatch 1 (pure ink only, off by default): shadow masses as cross-hatching, by tone, at a hand angle or along the form
  let hatched = 0;
  if (hatch) { const hs = hatchShadows(shadow, L, w, h, pxMm, { ...HATCH_DEFAULTS, angleDeg: hatch.angle, fromForm: hatch.form }); kept = [...kept, ...hs]; hatched = hs.length; }
  const lines = kept.map(g => fromPoints(g, g.points));
  let shadowCells = 0; for (let i = 0; i < shadow.length; i++) shadowCells += shadow[i];
  const record = {
    stage, judge: lab.judge, cached: lab.cached, ...(lab.note ? { note: lab.note } : {}),
    regions: regions.map(rg => ({ id: rg.id, label: lab.labels[rg.id], from: lab.source[rg.id], ink: INK_RULES[lab.labels[rg.id]].ink, area: rg.area })),
    shadowShare: shadowCells / shadow.length,
    ...(foliageCells ? { foliageShare: foliageCells.reduce((s, v) => s + v, 0) / foliageCells.length } : {}),
    stats: r.stats,
    ...(geometry ? { geometry } : {}),
    ...(hatch ? { hatchStrokes: hatched } : {}),
    ...(sal ? { salience: sal } : {}),
  };
  fs.writeFileSync(path.join(out, `ink-labels${stage === 'opening' ? '' : '-' + stage}.json`), JSON.stringify(record, null, 1) + '\n');
  const pct = v => `${(100 * v).toFixed(0)}%`, s = r.stats;
  log(`ink decide, ${stage}: regions labelled by ${lab.judge}${lab.cached ? ' (cached)' : ''}; ${pct(s.keptPx / Math.max(1e-9, s.lengthPx))} of the line length kept; mass-edge share of the length ${pct(s.massBefore)} before, ${pct(s.massAfter)} after; cut ${s.droppedMm.mass.toFixed(0)} mm mass edge, ${s.droppedMm.faint.toFixed(0)} mm faint, ${Object.entries(s.droppedMm.label).map(([k, v]) => `${v.toFixed(0)} mm ${k}`).join(', ')}`);
  if (sal) log(`ink salience, ${stage}: ${sal.sets} connected sets (${sal.closedSets} closed); ${sal.linesDropped} isolated pieces, ${sal.droppedMm.toFixed(0)} mm, left to the wash`);
  if (geometry) log(`ink geometry, ${stage}: ${geometry.fragmentsBefore} fragments to ${geometry.fragmentsAfter}; mean curvature energy per stroke ${geometry.energyBefore.toFixed(4)} to ${geometry.energyAfter.toFixed(4)} rad2/mm2; ${geometry.geometry} traces replaced by straight runs and arcs, ${geometry.kept} form or feature contours kept, ${geometry.droppedSquiggle} squiggles left to the wash (${geometry.offSource} off the source, ${geometry.tooManyPieces} too many pieces)`);
  return { lines, record, labelsOf: LABELS };
}
