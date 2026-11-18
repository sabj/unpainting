// Pipeline: inking, stage 2 (hold and measure the lines): the ink-or-wash decision for every candidate line.
// A point of a candidate line is drawn only when the ink rule of the ground under it allows it (ink-labels.mjs) and the
// source shows a pen line there (line-class.mjs). Long, smooth, mostly pen lines keep their global exception.
// Source-model contours may also retain supported dark/light mass boundaries in architecture or ground; explicit
// semantic exclusions still cut them. Physical-scale coherence assessment never straightens emitted geometry.
// Pure: arrays in, arrays out, with a record of every cut.
import { resample, turning, smoothPath } from './ink-lines.mjs';
import { classifyPathDetail, crossProfile, CLASS, MASS_DEFAULTS } from './line-class.mjs';
import { ruleAt, toneShadowTakes } from './ink-labels.mjs';

const median = (v, a, b) => { const s = Array.from(v.slice(a, b)).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const arc = pts => { const d = [0]; for (let k = 1; k < pts.length; k++) d.push(d[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y)); return d; };
export const DECIDE_DEFAULTS = Object.freeze({
  ...MASS_DEFAULTS,
  strongContrast: 20,      // L*: a stroke this much darker than both sides is ink wherever it lies
  bridgeMm: 0.8,           // a hand does not lift for a gap this short between two drawn runs of one line
  reachMm: 0.6,            // a contour is drawn when either side within this reach is ink-worthy
  dropFaint: true,         // a point with no contrast of its own and no step beside it is texture
  keepPenShare: 0.6,       // a structural line is at least this share pen line
  elongatedDegPerMm: 25,   // a trunk or branch stroke turns no faster than this
});

/**
 * Decide `lines` ({ points: [{x, y, width?, weight?}], ... }).
 * @param ctx { L, w, h, pxMm, cellLabel(x, y) -> label, inputKind?, shadow? (0/1 plane) }
 * @returns { lines, stats } stats: { lengthPx, keptPx, massBefore, massAfter, dropped: { mass, faint, label, short, squiggle }, byLabel }
 * and reasonMm: { <label>: { kept, label_none, contrast_<class>, mass, faint, short, turny } } (mm), where each label's length went
 */
export function decideLines(lines, ctx, options = {}) {
  const o = { ...DECIDE_DEFAULTS, ...options };
  const { L, w, h, pxMm } = ctx, reach = Math.max(1, o.reachMm / pxMm);
  // `stroke` candidates are the source's own observed pen ink (copy-lines on the target's ink pixels): pen by construction.
  // The priors against leaf and wash texture (the shortest piece, the turning rate, the tone shadow's contrast floor) are
  // for lines that may be wash edges (a learned line map); where the class test shows a pen line in observed ink they do not apply.
  const observedInk = ctx.inputKind === 'stroke';
  const labelAt = (x, y, toneShadow = true) => {
    const xi = Math.max(0, Math.min(w - 1, Math.floor(x))), yi = Math.max(0, Math.min(h - 1, Math.floor(y)));
    const base = ctx.cellLabel(xi, yi), i = yi * w + xi;
    // a face or a hand is never taken for a shadow or for leaves by the tone and colour passes
    if (base === 'face' || base === 'hands') return base;
    // leaves found by colour and texture are wash even where a region's label missed them; a trunk's own region stays a trunk
    if (ctx.foliage && ctx.foliage[i] && base !== 'tree_trunk') return 'foliage';
    // the tone-mass pass only adds the shadow's stricter rule over ground that draws structure or outline; a region the label
    // reads as wash-only or as trunk and branch keeps its own rule (a pen hatch inside a dark wash is not a shadow edge)
    return toneShadow && ctx.shadow && ctx.shadow[i] && toneShadowTakes(base) ? 'shadow_mass' : base;
  };
  const DROP_REASON = { LIVE: 0, MASS: 1, FAINT: 2, CONTRAST: 3, LABEL_NONE: 4 };
  const drop = { mass: 0, faint: 0, label: {}, short: 0 }, byLabel = {}, out = [];
  let lengthPx = 0, keptPx = 0, massLen = 0, keptMass = 0, retainedStructuralMass = 0;
  const add = (label, key, px) => { (byLabel[label] ??= { keptPx: 0, droppedPx: 0 })[key] += px; };
  // why each label lost or kept its length: reasonPx[label][reason] (reason: kept, label_none, contrast, mass, faint, short, turny)
  const reasonPx = {};
  const why = (label, reason, px) => { const r = (reasonPx[label ?? 'none'] ??= {}); r[reason] = (r[reason] ?? 0) + px; };
  for (const g of lines) {
    const rawPts = (g.points || []).map((p, k) => {
      const x = Array.isArray(p) ? p[0] : p.x;
      const y = Array.isArray(p) ? p[1] : p.y;
      const width = Array.isArray(g.widths) && k < g.widths.length ? g.widths[k] : p.width;
      const weight = Array.isArray(g.weights) && k < g.weights.length ? g.weights[k] : p.weight;
      return { x, y, ...(width != null ? { width } : {}), ...(weight != null ? { weight } : {}) };
    });
    const R = resample(rawPts, 1); if (R.length < 2) continue;
    const { cls, contrast } = classifyPathDetail(R, L, w, h, pxMm, o), d = arc(R), total = d.at(-1);
    lengthPx += total;
    let pen = 0, mass = 0;
    for (let k = 1; k < R.length; k++) { const s = d[k] - d[k - 1]; if (cls[k] === CLASS.pen) pen += s; else if (cls[k] === CLASS.mass) { mass += s; massLen += s; } }
    // Assess curvature at the existing physical scale, not the raster staircase.
    // These assessment points never replace the emitted trace or its pressure.
    const physicalTurning = pts => turning(smoothPath(pts, { sigma: o.smoothMm / pxMm })) / pxMm;
    const contourTurning = physicalTurning(R);
    const structural = total * pxMm >= o.structureMm && contourTurning <= o.structureDegPerMm && pen >= o.keepPenShare * total;
    const rules = R.map(p => ruleAt(labelAt, p.x, p.y, reach));
    // INK-SPEC step 3: model structure between a dark mass and a light one is still drawn.
    // Assess raster staircases at the existing physical smoothing scale; never move emitted points.
    const modelStructure = ctx.inputKind === 'line-map' && total * pxMm >= o.structureMm &&
      contourTurning <= o.structureDegPerMm;
    const structuralMass = new Uint8Array(R.length);
    const semanticRules = modelStructure ? R.map(p => ruleAt((x, y) => labelAt(x, y, false), p.x, p.y, reach)) : null;
    const live = new Uint8Array(R.length);
    const reason = new Uint8Array(R.length);
    for (let k = 0; k < R.length; k++) {
      const seg = k ? d[k] - d[k - 1] : 0, r = rules[k];
      if (structural) { live[k] = 1; continue; }
      if (modelStructure) {
        const semantic = semanticRules[k];
        if (semantic.label === 'architecture' || semantic.label === 'ground') {
          const a = R[Math.max(0, k - 2)], b = R[Math.min(R.length - 1, k + 2)];
          const tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const support = crossProfile(L, w, h, R[k], -(b.y - a.y) / tl, (b.x - a.x) / tl, pxMm, o);
          if (support.contrast >= o.penContrast || support.step >= o.stepContrast) {
            // A derived tone-shadow mask is not a semantic shadow region. Explicit shadow/foliage still veto mass contours.
            rules[k] = semantic; live[k] = 1; structuralMass[k] = cls[k] === CLASS.mass ? 1 : 0; continue;
          }
        } else if (cls[k] !== CLASS.pen && ['foliage', 'sky', 'water', 'shadow_mass'].includes(semantic.label)) {
          // Neither mass nor faint gaps in explicit wash-only regions may bridge structural runs.
          // Pen-supported marks still follow the existing rules (including the global pen exception).
          reason[k] = DROP_REASON.LABEL_NONE;
          drop.label[semantic.label] = (drop.label[semantic.label] ?? 0) + seg;
          add(semantic.label, 'droppedPx', seg); continue;
        }
      }
      if (r.ink === 'none') { reason[k] = DROP_REASON.LABEL_NONE; const name = labelAt(R[k].x, R[k].y); drop.label[name] = (drop.label[name] ?? 0) + seg; add(name, 'droppedPx', seg); why(name, 'label_none', seg); continue; }
      if (r.ink !== 'none' && r.penContrast && contrast[k] < r.penContrast && !(observedInk && cls[k] === CLASS.pen)) { reason[k] = DROP_REASON.CONTRAST; const name = r.label; drop.label[name] = (drop.label[name] ?? 0) + seg; add(name, 'droppedPx', seg); why(name, 'contrast_' + ['faint','pen','mass'][cls[k]], seg); continue; }
      if (cls[k] === CLASS.mass) { reason[k] = DROP_REASON.MASS; drop.mass += seg; add(r.label ?? 'none', 'droppedPx', seg); why(r.label, 'mass', seg); continue; }
      if (cls[k] === CLASS.faint && o.dropFaint) { reason[k] = DROP_REASON.FAINT; drop.faint += seg; add(r.label ?? 'none', 'droppedPx', seg); why(r.label, 'faint', seg); continue; }
      live[k] = 1;
    }
    // bridge the short gaps the mass and faint cuts left inside a line, excluding intentional semantic label cuts
    for (let k = 0, gapFrom = -1; k < R.length; k++) {
      if (!live[k]) { if (gapFrom < 0 && k > 0 && live[k - 1]) gapFrom = k; continue; }
      if (gapFrom >= 0) {
        const gapLenMm = (d[k] - d[gapFrom - 1]) * pxMm;
        let canBridge = gapLenMm < o.bridgeMm;
        if (canBridge) {
          for (let j = gapFrom; j < k; j++) {
            if (reason[j] !== DROP_REASON.MASS && reason[j] !== DROP_REASON.FAINT) { canBridge = false; break; }
          }
          const prevLabel = rules[gapFrom - 1]?.label;
          const nextLabel = rules[k]?.label;
          if (prevLabel && nextLabel && prevLabel !== nextLabel) { canBridge = false; }
        }
        if (canBridge) {
          for (let j = gapFrom; j < k; j++) {
            live[j] = 1;
            const segJ = j ? d[j] - d[j - 1] : 0;
            if (reason[j] === DROP_REASON.MASS) drop.mass -= segJ;
            else if (reason[j] === DROP_REASON.FAINT) drop.faint -= segJ;
            const labelName = rules[j]?.label ?? 'none';
            if (byLabel[labelName]) byLabel[labelName].droppedPx -= segJ;
            reason[j] = 0;
          }
        }
        gapFrom = -1;
      }
    }
    let start = -1;
    for (let k = 0; k <= R.length; k++) {
      const on = k < R.length && live[k];
      if (on && start < 0) start = k;
      if (!on && start >= 0) {
        const piece = R.slice(start, k), pd = arc(piece), pl = pd.at(-1), mid = rules[start + (piece.length >> 1)];
        // trunks and branches are long strokes; leaves are wash. A strong ink stroke (ironwork through a garden, a figure in
        // front of a hedge) is not a leaf, whatever the ground's colour: it stays.
        const strong = median(contrast, start, k) >= o.strongContrast;
        let penPx = 0; for (let j = start + 1; j < k; j++) if (cls[j] === CLASS.pen) penPx += d[j] - d[j - 1];
        const drawnPen = observedInk && penPx >= o.keepPenShare * pl;
        const lenMm = pl * pxMm, tooShort = piece.length < 2 || lenMm < 0.3 || (!structural && !strong && !drawnPen && mid.ink === 'elongated' && lenMm < (mid.minMm ?? 0));
        const tooTurny = !structural && !strong && !drawnPen && mid.ink === 'elongated' && physicalTurning(piece) > o.elongatedDegPerMm;
        if (tooShort || tooTurny) { drop.short += pl; add(mid.label ?? 'none', 'droppedPx', pl); why(mid.label, tooShort ? 'short' : 'turny', pl); }
        else {
          // the shortest piece the ground allows (ink-labels.mjs minMm) is applied by the salience step, after collinear
          // pieces are joined: a trace is cut at every junction, so a contour arrives in pieces of a millimetre or two
          const { widths: _w, weights: _wt, ...restG } = g;
          out.push({ ...restG, points: piece, inkLabel: mid.label ?? 'none', inkMinMm: structural || drawnPen ? 0 : (Number.isFinite(mid.minMm) ? mid.minMm : 0) });
          keptPx += pl; add(mid.label ?? 'none', 'keptPx', pl); why(mid.label, 'kept', pl);
          for (let j = start + 1; j < k; j++) if (cls[j] === CLASS.mass) {
            keptMass += d[j] - d[j - 1];
            if (structuralMass[j]) retainedStructuralMass += d[j] - d[j - 1];
          }
        }
        start = -1;
      }
    }
  }
  const mm = px => px * pxMm;
  return { lines: out, stats: {
    lines: lines.length, pieces: out.length, lengthPx, keptPx, retainedStructuralMassMm: mm(retainedStructuralMass),
    massBefore: lengthPx ? massLen / lengthPx : 0, massAfter: keptPx ? keptMass / keptPx : 0,
    droppedMm: { mass: mm(drop.mass), faint: mm(drop.faint), short: mm(drop.short), label: Object.fromEntries(Object.entries(drop.label).map(([k, v]) => [k, mm(v)])) },
    reasonMm: Object.fromEntries(Object.entries(reasonPx).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([r, px]) => [r, mm(px)]))])),
    byLabelMm: Object.fromEntries(Object.entries(byLabel).map(([k, v]) => [k, { kept: mm(v.keptPx), dropped: mm(v.droppedPx) }])),
  } };
}

