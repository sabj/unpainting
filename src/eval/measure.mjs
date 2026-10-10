// One picture in, raw measurements out. Scoring lives in score.mjs.
import { components } from './morph.mjs';
import { buildField } from './field.mjs';
import { measureStrokes, measureDots } from './strokes.mjs';
import { measureWashes } from './washes.mjs';
import { measureValues } from './values.mjs';
import { measurePaper } from './paper.mjs';
import { classifyInstruments } from './instruments.mjs';

export function measureImage(img, impose = null) {
  const field = buildField(img, impose);
  const comps = components(field.ink, field.w, field.h);
  return {
    file: img.file, w: img.w, h: img.h, inkFloor: img.inkFloor, scale: img.scale,
    field, lineWidth: field.lineWidth, inkFrac: field.inkFrac,
    lineShare: field.lineArea / Math.max(1, field.inkArea), broadShare: field.broadArea / Math.max(1, field.inkArea), twoScale: field.twoScale, broadR: field.broadR,
    strokes: measureStrokes(field), dots: measureDots(field, comps),
    washes: measureWashes(field), values: measureValues(field), paper: measurePaper(field),
    instruments: classifyInstruments(field),
    // settings a second picture must reuse so both are cut into marks the same way
    scale2: { twoScale: field.twoScale, broadR: field.broadR, lineWidth: field.lineWidth, allWash: field.allWash, dMax: field.dMax },
  };
}

// Compact printable view; drops the pixel arrays.
export function summary(m) {
  const r = (v, d = 2) => (Number.isFinite(v) ? +v.toFixed(d) : null);
  return {
    size: `${m.w}x${m.h}`, lineWidth: r(m.lineWidth), broadR: Number.isFinite(m.broadR) ? r(m.broadR, 1) : 'none', inkFrac: r(m.inkFrac, 3),
    lineShare: r(m.lineShare, 3), broadShare: r(m.broadShare, 3),
    strokes: { n: m.strokes.count, resolved: m.strokes.resolved, widthRatio: r(m.strokes.widthRatio),
      widthRatioP90: r(m.strokes.widthRatioP90), lenMedian: r(m.strokes.lenMedian, 1), lenCV: r(m.strokes.lenCV),
      lenSpread: r(m.strokes.lenP90overP10, 1), endTaper: r(m.strokes.endTaper), blotEnds: r(m.strokes.blotEnds),
      thinEnds: r(m.strokes.thinEnds), tidyEnds: r(m.strokes.tidyEnds), ends: m.strokes.endsMeasured,
      breaksPer100: r(m.strokes.breaksPer100, 1), densRange: r(m.strokes.densRange),
      loadRatio: r(m.strokes.loadRatio), loadRatioP90: r(m.strokes.loadRatioP90), endLoad: r(m.strokes.endLoad),
      blotLoadEnds: r(m.strokes.blotLoadEnds), fadeEnds: r(m.strokes.fadeEnds), flatEnds: r(m.strokes.flatEnds), tooDense: !!m.strokes.tooDense },
    dots: { n: m.dots.dots, areaFrac: r(m.dots.dotFrac, 3), countFrac: r(m.dots.dotCountFrac), nnRatio: r(m.dots.nnRatio) },
    washes: { n: m.washes.count, measured: m.washes.measured, grainCV: r(m.washes.grainCV, 3),
      modulation: r(m.washes.modulation), rim: r(m.washes.rimFrac), hard: r(m.washes.hardFrac),
      lost: r(m.washes.lostFrac), both: r(m.washes.bothEdges) },
    values: { levels: m.values.levels, at: m.values.levelDensities, interstitial: r(m.values.interstitial),
      darkLevels: m.values.darkLevels, layerEdge: r(m.values.layerEdge), darkGrain: r(m.values.darkGrain, 3), dMax: r(m.values.dMax) },
    paper: { untouched: r(m.paper.untouched, 3), reserveFrac: r(m.paper.reserveFrac, 3),
      shaped: r(m.paper.shapedFrac), speckleArea: r(m.paper.speckleArea), speckles: m.paper.speckleCount },
    mix: Object.fromEntries(Object.entries(m.instruments.mix).map(([k, v]) => [k, r(v, 3)])),
  };
}
