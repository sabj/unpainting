// Broad passages: is the tone inside varied, does the perimeter carry a drying rim, and does one shape hold
// both a hard and a lost edge?
import { components, erode, distanceTransform, invert, boundary, sampleBilinear, blur } from './morph.mjs';
import { quantile, mean, sd } from './image.mjs';

// Edge work runs inside each region's padded bounding box to keep distance fields small.
function cropRegion(D, w, h, region, pad) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (region[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, m = new Uint8Array(cw * ch), d = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const s = (y + y0) * w + (x + x0); m[y * cw + x] = region[s]; d[y * cw + x] = D[s]; }
  return { m, d, w: cw, h: ch };
}

function edgeProfileStats(D0, w0, h0, region0, R) {
  const c = cropRegion(D0, w0, h0, region0, Math.ceil(12 + R * 0.2));
  const { m: region, d: D, w, h } = c;
  const inside = distanceTransform(region, w, h), outside = distanceTransform(invert(region, w, h), w, h);
  const S = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) S[i] = inside[i] - outside[i];
  const edge = boundary(region, w, h);
  const step = Math.max(0.6, R / 50), rimDepth = Math.max(2, 0.05 * R);
  const hardCut = Math.max(1.6, 0.03 * R), lostCut = Math.max(4.5, 0.10 * R);
  const stride = Math.max(1, Math.floor(edge.length / 400));
  const out = { hard: 0, lost: 0, middling: 0, abutting: 0, rim: 0, tested: 0, transitions: [] };
  const interior = [];
  for (let i = 0; i < w * h; i++) if (inside[i] > rimDepth * 2) interior.push(D[i]);
  const interiorMean = mean(interior) || 0;
  for (let k = 0; k < edge.length; k += stride) {
    const i = edge[k], x = i % w, y = (i / w) | 0;
    if (x < 3 || y < 3 || x > w - 4 || y > h - 4) continue;
    let gx = (S[i + 1] - S[i - 1]) / 2, gy = (S[i + w] - S[i - w]) / 2;
    const g = Math.hypot(gx, gy); if (g < 1e-3) continue; gx /= g; gy /= g;
    const at = t => sampleBilinear(D, w, h, x + gx * t * step, y + gy * t * step);
    const outVal = (at(-7) + at(-6) + at(-5)) / 3, inVal = (at(6) + at(7) + at(8)) / 3;
    out.tested++;
    if (inVal - outVal < 0.05) { out.abutting++; continue; }   // this side runs into other paint, not paper
    const lowT = outVal + 0.2 * (inVal - outVal), highT = outVal + 0.8 * (inVal - outVal);
    let tLow = null, tHigh = null;
    for (let t = -7; t <= 8; t += 0.25) { const v = at(t); if (tLow === null && v >= lowT) tLow = t; if (v >= highT) { tHigh = t; break; } }
    if (tLow === null || tHigh === null) { out.middling++; continue; }
    const tw = Math.max(0.25, (tHigh - tLow) * step);
    out.transitions.push(tw);
    if (tw <= hardCut) out.hard++; else if (tw >= lostCut) out.lost++; else out.middling++;
    if (interiorMean > 0 && at(rimDepth / step) > interiorMean * 1.08) out.rim++;
  }
  const real = out.hard + out.lost + out.middling || 1;
  return { hardFrac: out.hard / real, lostFrac: out.lost / real, midFrac: out.middling / real,
    abuttingFrac: out.tested ? out.abutting / out.tested : 0, rimFrac: out.tested ? out.rim / out.tested : 0,
    twMedian: out.transitions.length ? quantile(out.transitions, 0.5) : NaN, edgesTested: out.tested, interiorMean };
}

export function measureWashes(field) {
  const { w, h, n, D, broadMask, grain, lineWidth } = field;
  const { labels, areas, count } = components(broadMask, w, h);
  const minArea = Math.max(600, 120 * lineWidth * lineWidth);
  // only the twelve largest passages are profiled; the rest are counted
  const candidates = [];
  for (let l = 1; l <= count; l++) if (areas[l] >= minArea) candidates.push(l);
  candidates.sort((a, b) => areas[b] - areas[a]);
  const totalRegions = candidates.length, blurCache = new Map();
  const regions = [];
  for (const l of candidates.slice(0, 12)) {
    const mask = new Uint8Array(n); let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) if (labels[i] === l) { mask[i] = 1; sx += i % w; sy += (i / w) | 0; }
    const R = Math.sqrt(areas[l] / Math.PI);
    const core = erode(mask, w, h, Math.max(2.5, 0.12 * R));
    const vals = [], grains = [];
    for (let i = 0; i < n; i++) if (core[i]) { vals.push(D[i]); grains.push(grain[i]); }
    if (vals.length < 60) continue;
    const mu = mean(vals);
    // tone inside: fine speckle (grain) and slow sweep (modulation)
    const rb = Math.max(3, Math.round(0.12 * R));
    if (!blurCache.has(rb)) blurCache.set(rb, blur(D, w, h, rb));
    const trend = blurCache.get(rb);
    const tvals = []; for (let i = 0; i < n; i++) if (core[i]) tvals.push(trend[i]);
    const edge = edgeProfileStats(D, w, h, mask, R);
    regions.push({ area: areas[l], R, mu, cx: sx / areas[l], cy: sy / areas[l],
      grainCV: sd(grains) / Math.max(1e-3, mu),
      modulation: (quantile(tvals, 0.9) - quantile(tvals, 0.1)) / Math.max(1e-3, mu),
      flatness: 1 - Math.min(1, (sd(grains) / Math.max(1e-3, mu)) / 0.12),
      ...edge });
  }
  regions.sort((a, b) => b.area - a.area);
  const big = regions, wt = big.map(r => r.area), tot = wt.reduce((a, b) => a + b, 0) || 1;
  const wavg = key => big.reduce((a, r, i) => a + (Number.isFinite(r[key]) ? r[key] * wt[i] : 0), 0) / tot;
  // both edges: share of perimeter that is the rarer edge kind
  const bothEdges = big.length ? big.reduce((a, r, i) => a + 2 * Math.min(r.hardFrac, r.lostFrac) * wt[i], 0) / tot : NaN;
  return { count: totalRegions, measured: big.length, area: regions.reduce((a, r) => a + r.area, 0),
    grainCV: big.length ? wavg('grainCV') : NaN, modulation: big.length ? wavg('modulation') : NaN,
    rimFrac: big.length ? wavg('rimFrac') : NaN, hardFrac: big.length ? wavg('hardFrac') : NaN,
    lostFrac: big.length ? wavg('lostFrac') : NaN, bothEdges, regions: big };
}
