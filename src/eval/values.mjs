// Value structure: how many tones the sheet holds, and whether darks come from separated strokes or stacked
// transparent passes with stopped edges.
import { components, close, erode, blur } from './morph.mjs';
import { quantile } from './image.mjs';

// Fewest levels that describe every inked pixel within a visible step (histogram peak finding fails on drawings).
function kmeans(sample, k) {
  let c = Array.from({ length: k }, (_, j) => sample[Math.min(sample.length - 1, Math.floor((j + 0.5) / k * sample.length))]);
  for (let pass = 0; pass < 30; pass++) {
    const sums = new Float64Array(k), cnt = new Float64Array(k);
    for (const v of sample) { let b = 0, bd = Infinity; for (let j = 0; j < k; j++) { const d = Math.abs(v - c[j]); if (d < bd) { bd = d; b = j; } } sums[b] += v; cnt[b]++; }
    let moved = 0;
    for (let j = 0; j < k; j++) if (cnt[j]) { const nc = sums[j] / cnt[j]; moved = Math.max(moved, Math.abs(nc - c[j])); c[j] = nc; }
    if (moved < 1e-4) break;
  }
  const err = [];
  for (const v of sample) { let bd = Infinity; for (let j = 0; j < k; j++) bd = Math.min(bd, Math.abs(v - c[j])); err.push(bd); }
  return { centres: c, p90: quantile(err, 0.9) };
}
function countLevels(values, step = 0.09) {
  if (values.length < 200) return [];
  const stride = Math.ceil(values.length / 20000);
  const sample = values.filter((_, i) => i % stride === 0).sort((a, b) => a - b);
  for (let k = 1; k <= 10; k++) { const fit = kmeans(sample, k); if (fit.p90 <= step || k === 10) return fit.centres.map(d => ({ d })); }
  return [];
}

export function measureValues(field) {
  const { w, h, n, D, ink, inkD, dMax, lineWidth, inkArea, img } = field;
  const levels = countLevels(inkD);
  const lo = img.inkFloor;

  // mid tone: separated marks with paper between, or a filled area?
  const q1 = quantile(inkD, 0.3), q3 = quantile(inkD, 0.8);
  const mid = new Uint8Array(n); let midArea = 0;
  for (let i = 0; i < n; i++) if (ink[i] && D[i] >= q1 && D[i] <= q3) { mid[i] = 1; midArea++; }
  const gap = Math.max(2, 2 * lineWidth);
  const midClosed = close(mid, w, h, gap);
  let closedArea = 0; for (let i = 0; i < n; i++) closedArea += midClosed[i];
  const interstitial = closedArea > 0 ? 1 - midArea / closedArea : NaN;

  // darks: density plateaus and the step length between them
  const darkCut = quantile(inkD, 0.82);
  const dark = new Uint8Array(n); let darkArea = 0;
  for (let i = 0; i < n; i++) if (ink[i] && D[i] >= darkCut) { dark[i] = 1; darkArea++; }
  let darkLevels = NaN, layerEdge = NaN, darkGrain = NaN;
  if (darkArea > 400) {
    const step = Math.max(0.10, (dMax - lo) / 6);
    const counts = new Map();
    for (let i = 0; i < n; i++) if (dark[i]) { const b = Math.round(D[i] / step); counts.set(b, (counts.get(b) || 0) + 1); }
    darkLevels = [...counts.values()].filter(c => c >= 0.08 * darkArea).length;
    // internal steps: gradient inside the dark passage, outer boundary eroded away
    const inner = erode(dark, w, h, Math.max(2, lineWidth));
    const sm = blur(D, w, h, Math.max(1, Math.round(lineWidth / 2)));
    let steps = 0, innerArea = 0, gsum = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (!inner[i]) continue; innerArea++;
      const g = Math.hypot((sm[i + 1] - sm[i - 1]) / 2, (sm[i + w] - sm[i - w]) / 2);
      gsum += g; if (g > 0.35 * step) steps++;
    }
    if (innerArea > 200) { layerEdge = steps / Math.sqrt(innerArea); darkGrain = gsum / innerArea; }
  }
  return { levels: levels.length, levelDensities: levels.map(l => +l.d.toFixed(2)),
    interstitial, midArea, midFrac: midArea / Math.max(1, inkArea),
    darkLevels, layerEdge, darkGrain, darkFrac: darkArea / Math.max(1, inkArea), dMax };
}
