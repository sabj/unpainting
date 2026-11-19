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
import { joinCollinear } from './line-geometry.mjs';
import { fairLines, dropWandering } from './line-fair.mjs';
import { restoreBridges } from './line-bridge.mjs';
import { prunePenLines } from './pen-wash-lines.mjs';
import { estimateInkDark } from './line-class.mjs';
import { labPlanes } from './line-evidence.mjs';
import sharp from 'sharp';

// a gnarled line this long and this dark is a trunk or a main branch
const LONG_DARK_MM = 20;
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
export async function decideFile({ doc, L, image, out, stage, pxMm, segments, authored = false, judge = 'codex', cacheDir, log = () => {}, o: o0 = DECIDE_DEFAULTS, run, geom = false, geomOptions = GEOM_DEFAULTS, shadowMask = true, foliage = false, hatch = null, salient = false, inkDarkRule = false, joinMm = 0, economy = false , env = undefined}) {
  let o = o0;
  const { w, h } = doc.image, base = path.basename(image, path.extname(image));
  let seg = null, regions = [], lab = { judge: 'none', cached: true, labels: {}, source: {}, note: 'segments off' };
  // a plan's authored lines are its own reading of the subject: the target decides them (support, mass interior, foliage colour), the
  // region labels do not (a colour classifier can call a dog's coat sky). They are drawn as model structure is.
  if (authored) lab.note = 'authored lines: the plan\'s reading stands; region labels do not cut them';
  if (segments?.stem && !authored) {
    registerSegments(base, segments.stem);
    seg = await loadSegments(base, w, h);
    const segDoc = JSON.parse(fs.readFileSync(`${segments.stem}.json`, 'utf8'));
    regions = segDoc.regions.map(r => ({ ...r, id: Number(r.id) }));
    lab = await labelRegions({ image, regions, labelMap: seg.labels, w, h, judge, cacheDir, segKey: path.basename(segments.stem), log, ...(run ? { run } : {}), ...(env ? { env } : {}) });
  }
  const shadow = shadowMask ? shadowMassMask(L, w, h, pxMm) : new Uint8Array(w * h);
  // --inkfoliage 1: green, busy cells are leaves, wash only (line-foliage.mjs), whatever the regions' labels say
  let foliageCells = null;
  if (foliage) {
    const rgb = await sharp(image).flatten({ background: '#fff' }).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer(), lab = labPlanes(rgb, w, h);
    foliageCells = foliageMask(L, lab.A, lab.B, w, h, pxMm);
  }
  const cellLabel = (x, y) => (seg && !authored ? lab.labels[seg.labels[y * w + x]] : null) ?? 'architecture';
  // --inkdarkrule 1: ink is darker than any wash. The darkness of the source's own confident pen lines sets the level.
  if (inkDarkRule) { const dark = estimateInkDark(doc.lines.map(g => ({ points: toPoints(g) })), L, w, h, pxMm, o); if (dark != null) o = { ...o, inkDark: dark }; }
  // a traced pool arrives in pieces cut at junctions and fades. Pieces of one contour join first (collinear across a gap of up
  // to --inkjoin mm, never a squiggle), so a contour is decided as one line and then drawn whole or left off whole.
  let candidates = doc.lines.map(g => { const { widths: _w, weights: _g, ...rest } = g; return { ...rest, points: toPoints(g) }; });
  const chained = { before: candidates.length, after: candidates.length };
  // each piece is faired first: the trace grid's tremor reads as a squiggle and keeps a piece from being chained to its own ridge
  if (joinMm > 0) { candidates = joinCollinear(fairLines(candidates, { pxMm }).lines, { pxMm }, { ...GEOM_DEFAULTS, gapMm: joinMm }); chained.after = candidates.length; }
  const r = decideLines(candidates, { L, w, h, pxMm, inputKind: authored ? 'line-map' : doc.inputKind, cellLabel, shadow, foliage: foliageCells }, o);
  r.stats.chained = chained;
  // a short line the evidence cut, whose ends both meet kept lines, is structure that joins what is drawn: restored (line-bridge.mjs)
  const bridged = restoreBridges(r.dropped, r.lines, { pxMm });
  let kept = [...r.lines, ...bridged.lines.map(({ dropWhy: _why, ...g }) => g)], geometry = null;
  // --inkgeom 1: straight runs and arcs where the source shows them; squiggles that are not forms or features are left to the wash
  if (geom) {
    const isFeature = (x, y) => ['face', 'hands'].includes(cellLabel(Math.max(0, Math.min(w - 1, Math.round(x))), Math.max(0, Math.min(h - 1, Math.round(y)))));
    const gres = geometrise(kept, { L, w, h, pxMm, isFeature }, geomOptions);
    kept = gres.lines; geometry = gres.stats;
  }
  // --inkjoin mm: pieces that continue one another in a straight line join across a gap of up to mm (nothing is dropped)
  if (joinMm > 0) kept = joinCollinear(kept, { pxMm }, { ...GEOM_DEFAULTS, gapMm: joinMm });
  // a kept line follows its ridge and is drawn as a straight run, a clean arc or one smooth curve, with corners kept (line-fair.mjs):
  // the ridge is traced on a grid of a quarter millimetre or more, and no pen shakes as that grid does
  // a long line as dark as the source's own ink may reverse its curvature: a gnarled trunk is no scribble
  // the tone on the line: the darkest cell within two of each point, since fairing moves a point a fraction of a line width
  const darkestNear = p => { let m = Infinity; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m = Math.min(m, L[Math.max(0, Math.min(h - 1, Math.round(p.y) + dy)) * w + Math.max(0, Math.min(w - 1, Math.round(p.x) + dx))]); return m; };
  const meanOn = g => g.points.reduce((t, p) => t + darkestNear(p), 0) / g.points.length;
  const longDark = g => Number.isFinite(o.inkDark) && g.points.reduce((t, p, k) => (k ? t + Math.hypot(p.x - g.points[k - 1].x, p.y - g.points[k - 1].y) : 0), 0) * pxMm >= LONG_DARK_MM && meanOn(g) <= o.inkDark;
  // (a plan's authored curls are its design: they are faired within the same limit, never dropped as scribbles)
  const fairing = fairLines(kept, { pxMm }), wandering = authored ? { lines: fairing.lines, stats: { dropped: 0, droppedMm: 0 } } : dropWandering(fairing.lines, { pxMm, exempt: longDark, isFeature: (x, y) => ['face', 'hands'].includes(cellLabel(Math.max(0, Math.min(w - 1, Math.round(x))), Math.max(0, Math.min(h - 1, Math.round(y))))) });
  kept = wandering.lines; fairing.stats.wanderingDropped = wandering.stats.dropped; fairing.stats.wanderingDroppedMm = Math.round(wandering.stats.droppedMm);
  // --inkeconomy 1: a draughtsman's economy (pen-wash-lines.mjs) without its random omission. Specks under 0.8 mm go; a
  // small mark that nearly repeats a neighbour goes; no 4 mm square carries more than 9 mm of small marks, longest kept
  // first; every mark 3 mm across or more stays.
  let economyStats = null;
  if (economy) {
    const withLength = kept.map(g => { let s = 0; for (let k = 1; k < g.points.length; k++) s += Math.hypot(g.points[k].x - g.points[k - 1].x, g.points[k].y - g.points[k - 1].y); return { ...g, length: s }; });
    const e = prunePenLines(withLength, { w, h, mmPerCell: pxMm, options: { keepAbove: -Infinity, joinMm: 0 } });
    kept = e.lines; economyStats = e.stats;
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
    bridged: bridged.stats.restored,
    fair: fairing.stats,
    ...(economyStats ? { economy: economyStats } : {}),
    ...(sal ? { salience: sal } : {}),
  };
  fs.writeFileSync(path.join(out, `ink-labels${stage === 'opening' ? '' : '-' + stage}.json`), JSON.stringify(record, null, 1) + '\n');
  const pct = v => `${(100 * v).toFixed(0)}%`, s = r.stats;
  log(`ink decide, ${stage}: regions labelled by ${lab.judge}${lab.cached ? ' (cached)' : ''}; ${pct(s.keptPx / Math.max(1e-9, s.lengthPx))} of the line length kept; mass-edge share of the length ${pct(s.massBefore)} before, ${pct(s.massAfter)} after; cut ${s.droppedMm.mass.toFixed(0)} mm mass edge, ${s.droppedMm.faint.toFixed(0)} mm faint, ${Object.entries(s.droppedMm.label).map(([k, v]) => `${v.toFixed(0)} mm ${k}`).join(', ')}`);
  if (sal) log(`ink salience, ${stage}: ${sal.sets} connected sets (${sal.closedSets} closed); ${sal.linesDropped} isolated pieces, ${sal.droppedMm.toFixed(0)} mm, left to the wash`);
  if (geometry) log(`ink geometry, ${stage}: ${geometry.fragmentsBefore} fragments to ${geometry.fragmentsAfter}; mean curvature energy per stroke ${geometry.energyBefore.toFixed(4)} to ${geometry.energyAfter.toFixed(4)} rad2/mm2; ${geometry.geometry} traces replaced by straight runs and arcs, ${geometry.kept} form or feature contours kept, ${geometry.droppedSquiggle} squiggles left to the wash (${geometry.offSource} off the source, ${geometry.tooManyPieces} too many pieces)`);
  return { lines, record, labelsOf: LABELS };
}
