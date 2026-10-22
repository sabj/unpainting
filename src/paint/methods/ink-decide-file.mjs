// Pipeline: inking, stage 2 (hold and measure the lines): the ink-or-wash decision applied to a line file.
// Labels the target's SAM regions (ink-labels.mjs), decides every candidate line (ink-decide.mjs), and writes
// <out>/ink-labels.json next to the painting: each region's label and ink rule, where the label came from, and what was
// cut and why. Planning only: it reads the target before the first mark.
import fs from 'node:fs';
import path from 'node:path';
import { loadSegments, registerSegments } from '../../crop/segments.mjs';
import { labelRegions, shadowMassMask, INK_RULES, LABELS } from './ink-labels.mjs';
import { decideLines, DECIDE_DEFAULTS } from './ink-decide.mjs';

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
export async function decideFile({ doc, L, image, out, stage, pxMm, segments, judge = 'codex', cacheDir, log = () => {}, o = DECIDE_DEFAULTS, run }) {
  const { w, h } = doc.image, base = path.basename(image, path.extname(image));
  registerSegments(base, segments.stem);
  const seg = await loadSegments(base, w, h), segDoc = JSON.parse(fs.readFileSync(`${segments.stem}.json`, 'utf8'));
  const regions = segDoc.regions.map(r => ({ ...r, id: Number(r.id) }));
  const lab = await labelRegions({ image, regions, labelMap: seg.labels, w, h, judge, cacheDir, segKey: path.basename(segments.stem), log, ...(run ? { run } : {}) });
  const shadow = shadowMassMask(L, w, h, pxMm);
  const cellLabel = (x, y) => lab.labels[seg.labels[y * w + x]] ?? 'architecture';
  const r = decideLines(doc.lines.map(g => ({ ...g, points: toPoints(g) })), { L, w, h, pxMm, cellLabel, shadow }, o);
  const lines = r.lines.map(g => fromPoints(g, g.points));
  let shadowCells = 0; for (let i = 0; i < shadow.length; i++) shadowCells += shadow[i];
  const record = {
    stage, judge: lab.judge, cached: lab.cached, ...(lab.note ? { note: lab.note } : {}),
    regions: regions.map(rg => ({ id: rg.id, label: lab.labels[rg.id], from: lab.source[rg.id], ink: INK_RULES[lab.labels[rg.id]].ink, area: rg.area })),
    shadowShare: shadowCells / shadow.length,
    stats: r.stats,
  };
  fs.writeFileSync(path.join(out, `ink-labels${stage === 'opening' ? '' : '-' + stage}.json`), JSON.stringify(record, null, 1) + '\n');
  const pct = v => `${(100 * v).toFixed(0)}%`, s = r.stats;
  log(`ink decide, ${stage}: regions labelled by ${lab.judge}${lab.cached ? ' (cached)' : ''}; ${pct(s.keptPx / Math.max(1e-9, s.lengthPx))} of the line length kept; mass-edge share of the length ${pct(s.massBefore)} before, ${pct(s.massAfter)} after; cut ${s.droppedMm.mass.toFixed(0)} mm mass edge, ${s.droppedMm.faint.toFixed(0)} mm faint, ${Object.entries(s.droppedMm.label).map(([k, v]) => `${v.toFixed(0)} mm ${k}`).join(', ')}`);
  return { lines, record, labelsOf: LABELS };
}
