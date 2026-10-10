// Measurements to scores. Fixed piecewise linear curves use knots informed by a real-watercolor corpus.
// Rounded and shifted knots do not map every percentile to an exact score. An unavailable measure returns null.

// Piecewise linear through knots of [measured value, 0..1 score], clamped at both ends.
function curve(v, knots) {
  if (!Number.isFinite(v)) return null;
  if (v <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    if (v <= knots[i][0]) { const [x0, y0] = knots[i - 1], [x1, y1] = knots[i]; return y0 + (y1 - y0) * (v - x0) / (x1 - x0); }
  }
  return knots[knots.length - 1][1];
}
// Plain band: full marks between good0 and good1, nothing outside dead0/dead1.
function band(v, dead0, good0, good1, dead1) {
  if (!Number.isFinite(v)) return null;
  if (v >= good0 && v <= good1) return 1;
  if (v <= dead0 || v >= dead1) return 0;
  return v < good0 ? (v - dead0) / (good0 - dead0) : (dead1 - v) / (dead1 - good1);
}

const pick = parts => {
  const live = parts.filter(p => p.s !== null);
  if (!live.length) return null;
  const wsum = live.reduce((a, p) => a + p.w, 0);
  return { value: 10 * live.reduce((a, p) => a + p.s * p.w, 0) / wsum, parts: live };
};
// The reason line names the lowest measure before weighting.
const nothing = why => ({ score: null, why });
const worst = parts => parts.filter(p => p.s !== null && p.w >= 0.15).sort((a, b) => a.s - b.s || b.w - a.w)[0]
  || parts.filter(p => p.s !== null).sort((a, b) => a.s - b.s)[0];
const fmt = v => (Number.isFinite(v) ? (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2)) : '-');

// Trailing comments: corpus p10 / median / p90 that set each curve.
const C = {
  loadRatio:    [[1.0, 0], [1.10, 0.3], [1.21, 0.6], [1.39, 1], [2.5, 1], [6, 0.75], [12, 0.3]],      // 1.21 / 1.37 / 1.66
  endBehaviour: [[0, 0], [0.09, 0.3], [0.18, 0.6], [0.33, 1], [0.7, 1], [1.01, 0.85]],                 // 0.17 / 0.32 / 0.49
  lengthSpread: [[1.0, 0], [1.6, 0.3], [2.2, 0.6], [3.7, 1], [14, 1], [45, 0.5]],                      // 2.2 / 3.7 / 8.2
  breaks:       [[0, 0], [3, 0.35], [7.6, 0.6], [20, 1], [45, 1], [110, 0.4]],                         // 7.6 / 21 / 26
  widthRatio:   [[1.0, 0], [1.2, 0.3], [1.6, 0.6], [2.5, 1], [8, 1], [20, 0.5]],                       // from the written sources only
  grain:        [[0, 0], [0.04, 0.3], [0.10, 0.6], [0.19, 1], [0.5, 1], [1.1, 0.35]],                  // 0.10 / 0.20 / 0.27
  modulation:   [[0, 0], [0.07, 0.3], [0.17, 0.6], [0.70, 1], [1.6, 1], [3.5, 0.4]],                   // 0.17 / 0.91 / 1.33
  rim:          [[0, 0], [0.01, 0.3], [0.03, 0.6], [0.10, 1], [0.55, 1], [1.01, 0.6]],                 // 0.02 / 0.12 / 0.20
  bothEdges:    [[0, 0], [0.08, 0.3], [0.22, 0.6], [0.42, 1], [1.01, 1]],                              // 0.24 / 0.45 / 0.55
  levels:       [[0, 0], [2, 0.5], [3, 0.75], [5, 1], [13, 1]],                                        // 2 / 10 / 10
  interstitial: [[0, 0], [0.05, 0.3], [0.13, 0.6], [0.24, 1], [0.92, 1]],                              // 0.14 / 0.24 / 0.56
  layerEdge:    [[0, 0], [0.5, 0.3], [1.3, 0.6], [8, 1], [40, 1], [95, 0.5]],                          // 1.3 / 11 / 18
  darkLevels:   [[0, 0], [1, 0.35], [2, 0.7], [3, 1], [6, 1], [9, 0.5]],                               // 2 / 3 / 4
  shaped:       [[0.2, 0], [0.55, 0.3], [0.80, 0.6], [0.92, 1], [1.01, 1]],                            // 0.87 / 0.94 / 0.97
  fit:          [[0, 0], [0.35, 0.25], [0.6, 0.55], [0.8, 0.85], [0.92, 1]],                           // paired only, no corpus
  toneErr:      [[0, 1], [0.12, 1], [0.25, 0.75], [0.45, 0.4], [0.9, 0]],                             // cell error over the target's own spread
  flood:        [[0, 1], [0.02, 1], [0.08, 0.7], [0.2, 0.35], [0.45, 0]],                             // cells the painting made much darker
  toneCorr:     [[0, 0], [0.3, 0.3], [0.55, 0.6], [0.8, 1], [1.01, 1]],
  penRecall:    [[0, 0], [0.25, 0.25], [0.5, 0.55], [0.75, 0.85], [0.92, 1]],
  inkPrecision: [[0, 0], [0.3, 0.25], [0.55, 0.6], [0.8, 1], [1.01, 1]],
  iou:          [[0, 0], [0.15, 0.3], [0.32, 0.6], [0.55, 1], [1.01, 1]],
  overPainted:  [[0, 1], [0.03, 1], [0.08, 0.7], [0.15, 0.4], [0.35, 0]],
  coverage:     [[0, 1], [0.05, 1], [0.12, 0.6], [0.30, 0]],
};

function scoreLineQuality(m) {
  const s = m.strokes;
  if (s.tooDense) return { score: null, why: 'no line work to measure: the picture has no scale break between line and passage, so nothing was traced as a mark' };
  if (s.count < 8) return { score: null, why: `no line work to measure: only ${s.count} traced marks` };
  const resolved = s.lineWidth >= 2.8;
  const parts = [
    { k: 'loadRatio', v: s.loadRatio, w: 0.30, s: curve(s.loadRatio, C.loadRatio) },
    { k: 'endBehaviour', v: (s.fadeEnds || 0) + (s.blotLoadEnds || 0), w: 0.25, s: curve((s.fadeEnds || 0) + (s.blotLoadEnds || 0), C.endBehaviour) },
    { k: 'lengthSpread', v: s.lenP90overP10, w: 0.12, s: curve(s.lenP90overP10, C.lengthSpread) },
    { k: 'breaks', w: 0.13, v: s.breaksPer100, s: curve(s.breaksPer100, C.breaks) },
    { k: 'widthVariation', v: s.widthRatio, w: 0.20, s: resolved ? curve(s.widthRatio, C.widthRatio) : null },
  ];
  const r = pick(parts); if (!r) return nothing('no stroke measure could be taken on this picture');
  const bad = worst(parts);
  const note = resolved ? '' : ` (width variation not measurable: marks are ${fmt(s.lineWidth)} px wide, under the 2.8 px needed to measure a width profile)`;
  const reasons = {
    loadRatio: `ink load along one mark varies ${fmt(s.loadRatio)}x, against 1.2 to 1.7x across the fifty reference sheets`,
    endBehaviour: `${Math.round(100 * ((s.fadeEnds || 0) + (s.blotLoadEnds || 0)))}% of ${s.endsMeasured} stroke ends blot or fade, against 17 to 51% across the reference sheets`,
    lengthSpread: `longest marks are ${fmt(s.lenP90overP10)}x the shortest, against 2.2 to 9x real`,
    breaks: `${fmt(s.breaksPer100)} free ends per 100 mark-widths of line, against 8 to 28 real`,
    widthVariation: `width varies ${fmt(s.widthRatio)}x inside a mark, against the fivefold real work shows`,
  };
  return { score: r.value, why: reasons[bad.k] + note, parts: r.parts };
}

function scoreWash(m) {
  const wm = m.washes;
  if (!wm.measured) return { score: null, why: 'no broad passage large enough to measure; the picture is line work or is too small a crop' };
  const parts = [
    { k: 'grain', v: wm.grainCV, w: 0.30, s: curve(wm.grainCV, C.grain) },
    { k: 'modulation', v: wm.modulation, w: 0.18, s: curve(wm.modulation, C.modulation) },
    { k: 'rim', v: wm.rimFrac, w: 0.22, s: curve(wm.rimFrac, C.rim) },
    { k: 'bothEdges', v: wm.bothEdges, w: 0.30, s: curve(wm.bothEdges, C.bothEdges) },
  ];
  const r = pick(parts); if (!r) return nothing('no wash measure could be taken on this picture');
  const bad = worst(parts);
  const reasons = {
    grain: `tone inside the washes varies by ${fmt(100 * wm.grainCV)}% of their own density, against 10 to 32% on the real sheets; real washes are never flat`,
    modulation: `the sweep across a wash is ${fmt(100 * wm.modulation)}% of its density, against 17 to 136% real`,
    rim: `${Math.round(100 * wm.rimFrac)}% of wash perimeter carries a drying rim, against 2 to 21% real`,
    bothEdges: `${Math.round(100 * wm.bothEdges)}% of a shape's perimeter is its rarer edge kind (${Math.round(100 * wm.hardFrac)}% hard, ${Math.round(100 * wm.lostFrac)}% lost), against 20 to 58% real; a real wash carries both on one shape`,
  };
  return { score: r.value, why: reasons[bad.k], parts: r.parts, note: `${wm.measured} of ${wm.count} passages profiled` };
}

function scoreValues(m) {
  const v = m.values;
  const countable = Math.max(curve(v.interstitial, C.interstitial) ?? 0, curve(v.layerEdge, C.layerEdge) ?? 0);
  const parts = [
    { k: 'levels', v: v.levels, w: 0.30, s: curve(v.levels, C.levels) },
    { k: 'countable', v: Math.max(v.interstitial || 0, 0), w: 0.45, s: countable },
    { k: 'darkLevels', v: v.darkLevels, w: 0.25, s: curve(v.darkLevels, C.darkLevels) },
  ];
  const r = pick(parts); if (!r) return nothing('no value measure could be taken on this picture');
  const bad = worst(parts);
  const reasons = {
    levels: `${v.levels} tones needed to describe the ink to within a visible step, against 3 or more on the reference sheets, where continuous tone saturates the count at 10`,
    countable: `tone is built as ${countable > 0.8 ? 'countable marks' : 'fill rather than passes'}: ${Math.round(100 * v.interstitial)}% paper shows between the mid-tone marks (19 to 59% real) and the darks carry ${fmt(v.layerEdge)} steps across them (1 to 22 real)`,
    darkLevels: `${v.darkLevels} density plateaus inside the darks, against 2 to 4 real; stacked passes leave countable steps`,
  };
  return { score: r.value, why: reasons[bad.k], parts: r.parts };
}

function scorePaper(m, pair) {
  const p = m.paper;
  const parts = [{ k: 'shaped', v: p.shapedFrac, w: 0.5, s: curve(p.shapedFrac, C.shaped) }];
  if (pair) {
    parts.push({ k: 'overPainted', v: pair.paintedOverPaper, w: 0.35, s: curve(pair.paintedOverPaper, C.overPainted) });
    parts.push({ k: 'coverage', v: Math.abs(pair.paintingPaper - pair.targetPaper), w: 0.15, s: curve(Math.abs(pair.paintingPaper - pair.targetPaper), C.coverage) });
  }
  const r = pick(parts); if (!r) return nothing('no paper measure could be taken: the picture has no reserves to judge');
  const bad = worst(parts);
  const reasons = {
    shaped: `${Math.round(100 * (1 - p.shapedFrac))}% of the untouched area is pinholes rather than shapes (3 to 14% on the real sheets); reserves should be places the brush went around`,
    overPainted: `${Math.round(100 * (pair ? pair.paintedOverPaper : 0))}% of the sheet was painted where the target leaves paper`,
    coverage: `${Math.round(100 * p.untouched)}% of the sheet untouched against ${Math.round(100 * (pair ? pair.targetPaper : 0))}% in the target`,
  };
  return { score: r.value, why: reasons[bad.k], parts: r.parts,
    note: `${Math.round(100 * p.untouched)}% untouched, reserves ${Math.round(100 * p.shapedFrac)}% shaped` };
}

function scoreInstruments(m, fit) {
  if (!fit) return { score: null, why: 'no target given, so there is nothing to say which instrument each mark should have been' };
  const s = curve(fit.fit, C.fit);
  // worst confusion: the target mark class most often laid as something else
  let worstRow = null;
  for (const [k, row] of Object.entries(fit.table)) {
    if (row.share < 0.08) continue;
    const laid = 1 - row.asMade.none; if (laid < 0.1) continue;
    const right = row.asMade[k] / laid, entries = Object.entries(row.asMade).filter(([j]) => j !== k && j !== 'none').map(([j, v]) => [j, v / laid]).sort((a, b) => b[1] - a[1]);
    if (!worstRow || right * row.share < worstRow.right * worstRow.share) worstRow = { k, right, share: row.share, as: entries[0] };
  }
  const miss = fit.missing > 0.12 ? `; a further ${Math.round(100 * fit.missing)}% of the target's ink was not laid at all` : '';
  const why = worstRow
    ? `of the ink the painting did lay, ${Math.round(100 * fit.fit)}% used the kind of mark the target asks for; the worst is ${worstRow.k} (${Math.round(100 * worstRow.share)}% of the target's ink), of which ${Math.round(100 * worstRow.right)}% came out as ${worstRow.k} and ${Math.round(100 * worstRow.as[1])}% as ${worstRow.as[0]}${miss}`
    : `of the ink the painting did lay, ${Math.round(100 * fit.fit)}% used the kind of mark the target asks for${miss}`;
  return { score: 10 * s, why, fit: fit.fit, missing: fit.missing };
}

// Caps: faults that good scores elsewhere must not outweigh.
function scoreTone(m, tone) {
  if (!tone) return { score: null, why: 'no target given, so there is nothing for the tone to agree with' };
  const parts = [
    { k: 'error', v: tone.relError, w: 0.40, s: curve(tone.relError, C.toneErr) },
    { k: 'flood', v: tone.floodFrac, w: 0.35, s: curve(tone.floodFrac, C.flood) },
    { k: 'corr', v: tone.corr, w: 0.25, s: curve(tone.corr, C.toneCorr) },
  ];
  const r = pick(parts); if (!r) return nothing('no tone cells could be compared');
  const bad = worst(parts);
  const reasons = {
    error: `tone is out by ${fmt(tone.cellError)} in density per cell, ${Math.round(100 * tone.relError)}% of the target's own range`,
    flood: `${Math.round(100 * tone.floodFrac)}% of cells are more than 0.22 density darker than the target: paint went where the picture is light`,
    corr: `local tone tracks the target at r=${fmt(tone.corr)}; the painting carries ${fmt(tone.overInk)}x the target's ink overall`,
  };
  return { score: r.value, why: reasons[bad.k], parts: r.parts };
}

function scoreStructure(m, st) {
  if (!st) return { score: null, why: 'no target given, so there is no drawing for the marks to agree with' };
  const parts = [
    { k: 'penRecall', v: st.penRecall, w: 0.40, s: curve(st.penRecall, C.penRecall) },
    { k: 'precision', v: st.inkPrecision, w: 0.30, s: curve(st.inkPrecision, C.inkPrecision) },
    { k: 'iou', v: st.iou, w: 0.30, s: curve(st.iou, C.iou) },
  ];
  const r = pick(parts); if (!r) return nothing('no structure could be compared');
  const bad = worst(parts);
  const reasons = {
    penRecall: `${Math.round(100 * st.penRecall)}% of the target's dark line work has any mark within 2 px of it: the drawing is being lost`,
    precision: `${Math.round(100 * st.inkPrecision)}% of the painting's ink lands within 2 px of ink in the target`,
    iou: `the two ink masks overlap ${Math.round(100 * st.iou)}%`,
  };
  return { score: r.value, why: reasons[bad.k], parts: r.parts };
}

function capsFor(m) {
  const caps = [], s = m.strokes, w = m.washes, v = m.values, p = m.paper, d = m.dots;
  if (w.measured && w.grainCV < 0.03 && w.modulation < 0.06) caps.push({ at: 4, why: 'the washes are flat fills: no grain and no sweep inside them' });
  if (w.measured && (w.hardFrac > 0.97 || w.lostFrac > 0.97)) caps.push({ at: 5, why: 'every wash edge is the same kind; real work carries a hard edge and a lost edge on one shape' });
  // cap on line ends only when there is enough line work for it to mean anything
  if (s.endsMeasured >= 40 && s.flatEnds > 0.92 && m.lineShare > 0.25) caps.push({ at: 5, why: `stroke ends are tidy caps: ${Math.round(100 * s.flatEnds)}% of ${s.endsMeasured} ends carry the same ink load as the middle of their mark` });
  if (Number.isFinite(p.shapedFrac) && p.shapedFrac < 0.45) caps.push({ at: 5, why: 'the untouched paper is mostly pinholes, not reserved shapes' });
  if (d.dotFrac > 0.15 && d.nnRatio > 0.95) caps.push({ at: 4, why: `dots are scattered like buckshot: ${Math.round(100 * d.dotFrac)}% of the ink is specks spread as evenly as random points` });
  if (v.interstitial < 0.05 && !(v.layerEdge > 0.9)) caps.push({ at: 4, why: 'tone is a fill: no paper between the mid-tone marks and no steps inside the darks' });
  return caps;
}

// Fidelity dimensions: is it a picture of its target. Craft dimensions: do its marks behave like marks.
// Craft cannot stand in for fidelity, since a flood can have good grain, edges and values.
const FIDELITY = ['instrument fit', 'tone agreement', 'structure agreement'];
const WEIGHTS = { 'line quality': 0.9, 'wash quality': 0.8, 'value structure': 0.7, paper: 0.6,
  'instrument fit': 1.2, 'tone agreement': 1.3, 'structure agreement': 1.3 };

export function judge(m, { fit = null, pair = null, tone = null, structure = null } = {}) {
  if (m.inkFrac < 0.015) return { dims: {}, overall: null, uncapped: null, caps: [], measured: [],
    why: `only ${(100 * m.inkFrac).toFixed(1)}% of this picture carries any mark; there is nothing to judge` };
  const dims = {
    'line quality': scoreLineQuality(m),
    'wash quality': scoreWash(m),
    'value structure': scoreValues(m),
    paper: scorePaper(m, pair),
    'instrument fit': scoreInstruments(m, fit),
    'tone agreement': scoreTone(m, tone),
    'structure agreement': scoreStructure(m, structure),
  };
  const live = Object.entries(dims).filter(([, d]) => d.score !== null);
  const fid = live.filter(([k]) => FIDELITY.includes(k));
  const caps = capsFor(m);

  // no target, no overall score: craft alone cannot tell a drawing from a flood
  if (!fid.length) {
    return { dims, overall: null, uncapped: null, caps, measured: live.map(([k]) => k), soloOnly: true,
      why: 'no overall score without a target: every measure available here is computed on this picture alone, and marks with human statistics can still be a picture of nothing. Use `pair` or `sheet`.' };
  }

  const wsum = live.reduce((a, [k]) => a + WEIGHTS[k], 0) || 1;
  const uncapped = live.reduce((a, [k, d]) => a + d.score * WEIGHTS[k], 0) / wsum;
  const cap = caps.reduce((a, c) => Math.min(a, c.at), 10);
  // fidelity caps the overall score, with two points of slack
  const weakestFid = fid.reduce((a, [k, d]) => (d.score < a.score ? { k, score: d.score } : a), { k: fid[0][0], score: fid[0][1].score });
  const fidCeiling = weakestFid.score + 2;
  const overall = Math.min(uncapped, cap, fidCeiling);

  const drivers = live.slice().sort((a, b) => a[1].score - b[1].score);
  let why;
  if (caps.length && cap <= overall + 0.05) why = `${caps.map(c => c.why).join('; ')} — held to ${cap}`;
  else if (fidCeiling <= uncapped - 0.05) why = `held down by ${weakestFid.k} at ${weakestFid.score.toFixed(1)}: ${dims[weakestFid.k].why}`;
  else why = `${drivers[0][1].score >= 8.5 ? 'nothing measured falls outside real practice; the closest is' : 'weakest is'} ${drivers[0][0]} at ${drivers[0][1].score.toFixed(1)}: ${drivers[0][1].why}`;

  return { dims, overall, uncapped, caps, why, measured: live.map(([k]) => k),
    fidelity: Object.fromEntries(fid.map(([k, d]) => [k, d.score])), fidCeiling };
}
