// The subject, read once as density against the paper (bare paper is zero, transparent passes add); its lights stay
// paper through every act. Its big shapes are the passages a painter states first: regions of one colour and tone at a
// hand's scale, with no names, light first and then larger first, the order a wash sheet is begun in.
import { channelDensity } from '../../crop/pigments.mjs';
import { gaussian } from '../../keyframes/density.mjs';
import { components, removeSmall, open as openMask } from '../../raster.js';

/** Density and tone of the picture against its paper. */
export function readSubject(px, w, h, paperRGB) {
  const n = w * h, D = channelDensity(px, n, paperRGB), tone = new Float32Array(n);
  for (let i = 0; i < n; i++) tone[i] = Math.max(0, (D[i * 3] + D[i * 3 + 1] + D[i * 3 + 2]) / 3);
  return { D, tone, w, h, n, paperRGB };
}

/** Reserve light components of at least minArea of the sheet whose blurred density is below bare.
 * Excluding pale specks within washes keeps the opening wash connected. */
export function lightsMask(tone, w, h, { bare = 0.05, sigma = 0.8, minArea = 0.001 } = {}) {
  const B = sigma > 0 ? gaussian(tone, w, h, sigma) : tone, m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = B[i] < bare ? 1 : 0;
  return minArea > 0 ? removeSmall(openMask(m, w, h, 1), w, h, Math.round(minArea * w * h)) : m;
}

/** Mean of a three-channel field over a mask. */
export function meanOver(F, mask) {
  const s = [0, 0, 0]; let c = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { s[0] += F[i * 3]; s[1] += F[i * 3 + 1]; s[2] += F[i * 3 + 2]; c++; }
  return c ? s.map(v => v / c) : s;
}

/**
 * The big shapes: k-means over the blurred density (value and colour both, so a dark brown and a pale brown are two
 * shapes), then the connected regions of each colour, those under `minArea` of the sheet dropped, the lights cut out.
 * The dropped fragments' cells are grown into from the shapes beside them, so the first washes cover the figure in a
 * few passages with no holes but the lights. Each shape carries its mean density, tone and light note (see shapeOf).
 */
export function bigShapes(S, w, h, { k = 8, sigma = null, minArea = 0.005, lights = null, iterations = 15, seed = 1, grow = 12, lightShare = 0.6, smooth = 1 } = {}) {
  const { D, n } = S, sig = sigma ?? Math.max(1, 0.015 * Math.min(w, h));
  // clustered on the square root of the blurred density: in density a pale note sits nearer the paper's cluster than
  // the next colour's and would be swallowed by it, never washed; the root spreads the pale notes apart
  const B = new Float32Array(n * 3);
  for (let c = 0; c < 3; c++) { const g = gaussian(Float32Array.from({ length: n }, (_, i) => D[i * 3 + c]), w, h, sig); for (let i = 0; i < n; i++) B[i * 3 + c] = Math.sqrt(Math.max(0, g[i])); }
  // seeds spread over the tone range, so a small dark passage is a colour of its own from the start
  const idx = Array.from({ length: n }, (_, i) => i).filter(i => !lights || !lights[i]);
  if (!idx.length) return [];
  const toneOf = i => (B[i * 3] + B[i * 3 + 1] + B[i * 3 + 2]) / 3;
  const byTone = idx.slice().sort((a, b) => toneOf(a) - toneOf(b));
  let centres = Array.from({ length: Math.min(k, idx.length) }, (_, j) => { const i = byTone[Math.floor(((j + 0.5) / k) * (byTone.length - 1))]; return [B[i * 3], B[i * 3 + 1], B[i * 3 + 2]]; });
  const label = new Int32Array(n).fill(-1);
  for (let it = 0; it < iterations; it++) {
    const acc = centres.map(() => [0, 0, 0, 0]);
    for (const i of idx) {
      let bj = 0, bd = Infinity;
      for (let j = 0; j < centres.length; j++) { const d = (B[i * 3] - centres[j][0]) ** 2 + (B[i * 3 + 1] - centres[j][1]) ** 2 + (B[i * 3 + 2] - centres[j][2]) ** 2; if (d < bd) { bd = d; bj = j; } }
      label[i] = bj; acc[bj][0] += B[i * 3]; acc[bj][1] += B[i * 3 + 1]; acc[bj][2] += B[i * 3 + 2]; acc[bj][3]++;
    }
    centres = centres.map((c, j) => (acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : c));
  }
  const shapes = [], min = Math.max(4, Math.round(minArea * n)), kept = new Int32Array(n);
  let nextId = 0;
  // a colour's region is opened by `smooth` cells before it is cut into pieces, so a ragged cluster boundary is not a
  // ragged passage; the fragments it sheds are grown back into. On a small sheet more than one cell erases passages.
  for (let j = 0; j < centres.length; j++) {
    let m = new Uint8Array(n); let any = 0;
    for (const i of idx) if (label[i] === j) { m[i] = 1; any++; }
    if (!any) continue;
    if (smooth > 0) m = openMask(m, w, h, smooth);
    const { labels, areas, count } = components(m, w, h);
    for (let id = 1; id <= count; id++) {
      if (areas[id] < min) continue;
      nextId++;
      for (let i = 0; i < n; i++) if (labels[i] === id) kept[i] = nextId;
    }
  }
  // grow the kept shapes into the fragments' cells, a ring at a time, never into the lights
  for (let it = 0; it < grow; it++) {
    const next = Int32Array.from(kept); let moved = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (kept[i] || (lights && lights[i])) continue;
      const nb = (x > 0 && kept[i - 1]) || (x < w - 1 && kept[i + 1]) || (y > 0 && kept[i - w]) || (y < h - 1 && kept[i + w]);
      if (nb) { next[i] = nb; moved++; }
    }
    kept.set(next);
    if (!moved) break;
  }
  for (let id = 1; id <= nextId; id++) {
    const mask = new Uint8Array(n); let area = 0;
    for (let i = 0; i < n; i++) if (kept[i] === id) { mask[i] = 1; area++; }
    shapes.push(shapeOf(S, mask, area, lightShare));
  }
  return shapes.sort((a, b) => (Math.abs(a.tone - b.tone) > 0.03 ? a.tone - b.tone : b.area - a.area));
}

/** A shape's measures from the subject: mean density, light note, tone. */
function shapeOf(S, mask, area, lightShare = 0.6) {
  const { D, tone } = S, mean = meanOver(D, mask);
  const cells = []; for (let i = 0; i < mask.length; i++) if (mask[i]) cells.push(i);
  cells.sort((a, b) => tone[a] - tone[b]);
  const q = Math.max(1, Math.round(cells.length / 4)), pale = [0, 0, 0];
  for (let s = 0; s < q; s++) for (let c = 0; c < 3; c++) pale[c] += D[cells[s] * 3 + c];
  const mt = (mean[0] + mean[1] + mean[2]) / 3, pt = (pale[0] + pale[1] + pale[2]) / 3 / q;
  // A pale passage (a sky, a distance) is laid once at nearly its whole note, since what it still wants after a half
  // wash never rises above a later round's level. A dark passage is built in glazes, since a dark laid in one step
  // reads as a slab. The share runs from 0.85 at a pale note down to `lightShare` at a full one.
  const t = Math.max(0, Math.min(1, (mt - 0.15) / 0.75));
  let share = 0.85 - (0.85 - lightShare) * t;
  if (mt > 1e-6) share = Math.max(share, Math.min(share + 0.2, pt / mt));
  return { mask, area: area ?? cells.length, mean, light: mean.map(v => v * share), tone: mt };
}
