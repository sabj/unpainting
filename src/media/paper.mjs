import { paperRelief, HEIGHT_SPAN_UM } from './paper-relief.mjs';
import { grainSurface } from './grain-field.mjs';
// Paper: a surface height made of fibres and tooth, and the capacity of its pores. Rough watercolour paper is a
// felt of cotton fibres pressed together, lightly sized (Computer-Generated Watercolor, section 2.1); the height steers water
// and granulating pigment, the capacity (c = h (cmax - cmin) + cmin) sets how much water it can absorb.
// DOM free.

// `scale` is cells per pixel of the picture. Every length below is a paper length, multiplied by it, so the grid
// does not decide how coarse the paper is.
// A paper is a pure function of its size and options, and a run asks for the same one many times (every calibration
// swatch is laid on a fresh 90 x 90 scrap of the painting's paper). The last few made are kept, and each caller gets
// its own copy, so nothing one sheet does to its paper reaches another. A store (setPaperStore) keeps them across runs.
const MADE = new Map(), KEEP = 4;
let STORE = null;
/** Keep papers outside this process: store { get(key) -> paper or null, put(key, paper) }, or null for none. */
export const setPaperStore = store => { STORE = store; };
const stable = v => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v);
export function makePaper(w, h, options = {}) {
  const key = JSON.stringify([w, h, stable(options ?? {})]);
  let paper = MADE.get(key);
  if (paper) MADE.delete(key);
  else {
    paper = STORE?.get(key) ?? null;
    if (!paper) { paper = buildPaper(w, h, options); STORE?.put(key, paper); }
    if (MADE.size >= KEEP) MADE.delete(MADE.keys().next().value);
  }
  MADE.set(key, paper);
  return structuredClone(paper);
}
function buildPaper(w, h, { seed = 1, fibres = 0.5, tooth = 0.5, fibreLength = 14, cmin = 0.2, cmax = 0.55, scale = 1, toothScale = 1, patternScale = 1, proudBlur = 1, coldPress = null, mmPerCell = 0, relief = 'cold', grainMm = 0 } = {}) {
  // Opt-in physical fibres: fibre size and count follow physical area.
  const fs = mmPerCell > 0 ? (280 / 1086) / mmPerCell : scale;
  const n = w * h, fib = new Float32Array(n), c2 = new Float32Array(n), s2 = new Float32Array(n); // fibre amount, and orientation as doubled angles (a fibre has no head or tail)
  // tooth coarseness in pixels of the picture. coldPress { mmPerCell }: a physical cold-press sheet instead of value
  // noise, with hollows and tooth in millimetres (0.4 mm a unit), so the sheet reads the same at any resolution.
  const ts = coldPress ? 0.4 / coldPress.mmPerCell : (mmPerCell > 0 ? fs : scale) * toothScale, ps = (mmPerCell > 0 ? fs : scale) * patternScale;
  // A physical sheet (coldPress or mmPerCell given) has its relief in micrometres (paper-relief.mjs): one field from 0.1
  // to a few millimetres, averaged over each cell and never stretched to the grid's range, so the same sheet at any
  // cell size is the same paper. `relief` cold (default), rough or hot. The fibres below still give the direction water
  // wicks along. The cold-press bump options (coldPress.bumpMm, cover, swell, pits) and fibres/tooth are not read there.
  const physMm = coldPress ? coldPress.mmPerCell : mmPerCell;
  const RF = physMm > 0 ? paperRelief(w, h, physMm, { seed, relief }) : null;
  const blur = r => Math.max(1, Math.round(r * ts));
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  // fibres: many short, slightly curved strands laid at random, a little thicker in the middle
  const count = Math.round(n / (9 * fs * fs));   // the same fibres per pixel of the picture, not per cell
  for (let f = 0; f < count; f++) {
    let x = rnd() * w, y = rnd() * h, a = rnd() * Math.PI, bend = (rnd() - 0.5) * 0.12; const L = fibreLength * fs * (0.4 + rnd());
    const stepL = 0.7 * fs;
    for (let t = 0; t < L; t += stepL) { a += bend * (mmPerCell > 0 ? 1 : scale); x += Math.cos(a) * stepL; y += Math.sin(a) * stepL; const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= w || yi >= h) break; const wt = (0.6 + 0.4 * Math.sin(Math.PI * t / L)) * fs; fib[yi * w + xi] += wt; c2[yi * w + xi] += wt * Math.cos(2 * a); s2[yi * w + xi] += wt * Math.sin(2 * a); }
  }
  const hash = (x, y) => { const q = Math.sin(x * 127.1 + y * 311.7 + seed * 17.3) * 43758.5453; return q - Math.floor(q); };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  const blurred = box(box(fib, w, h, blur(1)), w, h, blur(1));
  let fm = 0; for (const v of blurred) fm = Math.max(fm, v);
  const fscale = fm > 0 ? 1 / (fm * 0.5) : 0; // a sheet too small to hold a fibre is all tooth, not 0/0
  const height = new Float32Array(n), capacity = new Float32Array(n);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Two roughnesses: the tooth, a pixel or two across, leaves specks of paper in a wash; the pattern, several
    // pixels across, makes a wash pool in patches. One noise field cannot be both.
    const i = y * w + x;
    if (RF) { height[i] = RF.height[i]; continue; }
    const t = 0.6 * vn(x / (2.5 * ts), y / (2.5 * ts)) + 0.4 * vn(x / (7 * ps) + 11, y / (7 * ps) + 3);
    height[i] = fibres * Math.min(1, blurred[i] * fscale) + tooth * t; lo = Math.min(lo, height[i]); hi = Math.max(hi, height[i]);
  }
  if (!RF) for (let i = 0; i < n; i++) height[i] = (height[i] - lo) / (hi - lo || 1);
  // pigment settles and water pools at the scale of the paper's hollows, a few fibres across, not per fibre
  // On a physical sheet that is the height itself (each cell already averages the relief over its area), not stretched:
  // granulating pigment settles into hollows a few tenths of a millimetre across (looks/ref-washes.jpg).
  const valley = RF ? Float32Array.from(height) : box(height, w, h, blur(1));
  if (!RF) { let vl = Infinity, vh = -Infinity; for (const v of valley) { vl = Math.min(vl, v); vh = Math.max(vh, v); } for (let i = 0; i < n; i++) valley[i] = (valley[i] - vl) / (vh - vl || 1); }
  for (let i = 0; i < n; i++) capacity[i] = valley[i] * (cmax - cmin) + cmin;
  // the tooth a dragged brush feels: hills and hollows about a millimetre across, over which a clump rides
  const toothH = box(box(box(height, w, h, blur(2)), w, h, blur(2)), w, h, blur(2)); let tl = Infinity, th = -Infinity; for (const v of toothH) { tl = Math.min(tl, v); th = Math.max(th, v); }
  for (let i = 0; i < n; i++) toothH[i] = (toothH[i] - tl) / (th - tl || 1);
  // the direction water wicks along: the local fibre orientation, and how strongly the fibres there agree (0..1)
  const bc = box(c2, w, h, blur(1)), bs = box(s2, w, h, blur(1)), bf = box(fib, w, h, blur(1)), fdx = new Float32Array(n), fdy = new Float32Array(n), grain = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.atan2(bs[i], bc[i]) / 2, m = Math.hypot(bc[i], bs[i]); fdx[i] = Math.cos(a); fdy[i] = Math.sin(a); grain[i] = bf[i] > 1e-6 ? Math.min(1, (m / bf[i]) * Math.min(1, bf[i] / (fm * 0.3))) : 0; }
  // relief: the 10th to 90th percentile spread of height about the tooth's hills; a brush's bridge is a share of it.
  // proud: how far a fibre stands above its surroundings, blurred at proudBlur cells at height's own scale.
  const proudLow = box(height, w, h, Math.max(1, Math.round(proudBlur * (mmPerCell > 0 ? fs : 1))));
  const proud = new Float32Array(n); for (let i = 0; i < n; i++) proud[i] = height[i] - proudLow[i];
  // toothLo, toothSpan: the blurred tooth's own range before it was stretched to 0..1. A brush compares a fibre with the
  // tooth level under it in the height's own units (toothLevel); compared with the stretched tooth, the coarse hills read
  // as sunk below their own fibres and the hollows as raised, so a light brush touched the hollows and skipped the hills.
  const toothLo = tl, toothSpan = th - tl || 1;
  const rel = new Float32Array(n); for (let i = 0; i < n; i++) rel[i] = height[i] - (toothLo + toothSpan * toothH[i]);
  const sorted = Float32Array.from(rel).sort();
  const gridSpread = Math.max(1e-4, sorted[Math.floor(n * 0.9)] - sorted[Math.floor(n * 0.1)]);
  // On a physical sheet the spread is the paper's own, at full resolution (10th to 90th percentile of a relief of that
  // RMS about its millimetre mean, 2.56 RMS), so a brush reaches the same depth into the same paper on any grid; and
  // subRelief is the part of it a cell's mean hides (the RMS finer than the cell), which softens a cell's contact by
  // the share of its area that stands above a level, where the cell's mean alone would switch it at once.
  let reliefSpread = gridSpread, subRelief = 0;
  if (RF) {
    const full = RF.hollowRmsUm / HEIGHT_SPAN_UM; let v = 0; for (let i = 0; i < n; i++) v += rel[i] * rel[i];
    reliefSpread = 2.56 * full; subRelief = Math.sqrt(Math.max(0, full * full - v / n));
  }
  // zUm, reliefOf (physical sheets): the relief in micrometres and the seed and preset it was made from (sub-cell grain
  // evaluates the same field finer, subcell-grain.mjs); hollow: each cell's depth below the tooth level in RMS units
  // grainH: the surface granulating pigment settles and rolls on. A physical sheet's is its relief low-passed at a
  // length in millimetres (grain-field.mjs), its hollows measured in that field's own RMS; a sheet without units uses its height.
  const G = RF ? grainSurface(height, w, h, physMm, { seed, relief }, grainMm > 0 ? { grainMm } : {}) : { grainH: height, unit: 0 };
  return { w, h, n, height, grainH: G.grainH, capacity, valley, proud, tooth: toothH, toothLo, toothSpan, fdx, fdy, grain, relief: reliefSpread, subRelief, mmPerCell: physMm, ...toothHollow(G.grainH, toothH, toothLo, toothSpan, G.unit), ...(RF ? { zUm: RF.zUm, reliefUm: RF.rmsUm, reliefOf: { seed, relief } } : {}) };
}

/**
 * How deep each cell lies below the tooth level under it (the height's mean over about a millimetre), in units of
 * `unit` (height units; the relief's own RMS about that mean): the bias settling pigment has towards a hollow (B = 1 +
 * gamma hollow, settling.mjs). A physical sheet passes its relief's unit, fixed in micrometres, so a coarser grid sees
 * shallower hollows of the same paper; a paper without units (unit 0) is measured against its own RMS. The GPU works
 * the same expression out from the tooth, height and the three numbers (gpu/stepfull.wgsl settleShareG).
 */
export function toothHollow(height, tooth, toothLo, toothSpan, unit = 0) {
  const n = height.length, d = new Float64Array(n);
  for (let i = 0; i < n; i++) d[i] = toothLo + toothSpan * tooth[i] - height[i];
  if (!(unit > 0)) { let v = 0; for (let i = 0; i < n; i++) v += d[i] * d[i]; unit = Math.sqrt(v / n) || 1; }
  const hollow = new Float32Array(n); for (let i = 0; i < n; i++) hollow[i] = Math.max(0, d[i] / unit);
  return { hollow, hollowUnit: unit };
}

/** The blurred tooth's own range, [lo, span]: the tooth level under cell i in the height's own units is
 *  lo + span x tooth[i], what a hair riding the tooth is measured against. */
export function toothRange(paper) {
  if (!(paper.toothSpan > 0) || !Number.isFinite(paper.toothLo)) throw new Error('paper: no tooth range (toothLo, toothSpan); make it with makePaper or the scan paper');
  return [paper.toothLo, paper.toothSpan];
}

function box(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += src[y * w + xx]; c++; } } tmp[y * w + x] = s / c; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0, c = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; c++; } } out[y * w + x] = s / c; }
  return out;
}
