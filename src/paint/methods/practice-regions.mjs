// Shapes for the practice planner: regions bounded by the drawing's own lines, lights with soft irregular edges, and
// masks cut into connected passages.
//
//   --practicelinemin 0.003   a line-bounded region smaller than this share of the sheet joins its neighbour
//   --practicelightmin 0.0006 a reserved light smaller than this share of the sheet is left to the brush
//   --practicelightsoft 1.5   the light's edge is read at this blur (cells), and wanders by --practicelightwander 0.1
import { hasLines, loadLines } from '../../crop/lines.mjs';
import { components, removeSmall, dilate } from '../../raster.js';

// The drawing file's lines as a barrier field, one cell wide and dilated by `grow`.
export function lineBarrier(base, w, h, { grow = 1 } = {}) {
  if (!base || !hasLines(base)) return null;
  const B = new Uint8Array(w * h);
  for (const g of loadLines(base, w, h)) {
    const p = g.points;
    for (let k = 1; k < p.length; k++) {
      const a = p[k - 1], b = p[k], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(a.x + (b.x - a.x) * s / steps), y = Math.round(a.y + (b.y - a.y) * s / steps);
        if (x >= 0 && y >= 0 && x < w && y < h) B[y * w + x] = 1;
      }
    }
  }
  return grow > 0 ? dilate(B, w, h, grow) : B;
}

// Every cell a label: the components the lines cut the sheet into, the small ones (and the lines themselves) given to
// the neighbouring large region they touch first, breadth first.
export function lineRegions(barrier, w, h, { minShare = 0.003 } = {}) {
  const n = w * h, free = Uint8Array.from(barrier, v => 1 - v);
  const { labels, areas, count } = components(free, w, h, 4);
  const big = new Int32Array(count + 1); let R = 0;
  for (let id = 1; id <= count; id++) if (areas[id] >= minShare * n) big[id] = ++R;
  const out = new Int32Array(n), queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i = 0; i < n; i++) if (labels[i] && big[labels[i]]) { out[i] = big[labels[i]]; queue[qt++] = i; }
  while (qh < qt) {
    const i = queue[qh++], x = i % w, y = (i / w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !out[j]) { out[j] = out[i]; queue[qt++] = j; }
  }
  return { labels: out, count: R };
}

// A mask cut into its connected pieces along `cut` (the drawing's lines), each a list of cells, largest first. The cut
// cells and the fragments under `min` cells go to the piece they touch first, so cutting at a line never drops paint;
// a fragment that touches no piece (a shape the drawing closes, a tree inside its outline) stays its own piece.
export function pieces(mask, w, h, { min = 1, cut = null } = {}) {
  const n = w * h, m = cut ? Uint8Array.from(mask, (v, i) => (v && !cut[i] ? 1 : 0)) : mask;
  const { labels, areas, count } = components(m, w, h);
  const id = new Int32Array(n), queue = new Int32Array(n), big = new Int32Array(count + 1);
  let R = 0, qh = 0, qt = 0;
  for (let c = 1; c <= count; c++) if (areas[c] >= min) big[c] = ++R;
  for (let i = 0; i < n; i++) if (labels[i] && big[labels[i]]) { id[i] = big[labels[i]]; queue[qt++] = i; }
  while (qh < qt) {
    const i = queue[qh++], x = i % w, y = (i / w) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && mask[j] && !id[j]) { id[j] = id[i]; queue[qt++] = j; }
  }
  // what is left touches no piece: its own pieces, if big enough to be a mark
  const rest = Uint8Array.from(mask, (v, i) => (v && !id[i] ? 1 : 0));
  const r2 = components(rest, w, h);
  for (let i = 0; i < n; i++) if (r2.labels[i] && r2.areas[r2.labels[i]] >= 4) id[i] = R + r2.labels[i];
  const by = new Map();
  for (let i = 0; i < n; i++) if (id[i]) { if (!by.has(id[i])) by.set(id[i], []); by.get(id[i]).push(i); }
  return [...by.values()].map(c => Int32Array.from(c)).sort((a, b) => b.length - a.length);
}

// Reserved lights as a painter masks them: the light's own shape read soft, with an edge that wanders a little, and
// nothing smaller than a deliberate shape. A speck the size of a cell is left to the brush's skip over the tooth.
export function shapeLights(raw, { w, h, n, gaussian, num, seed = 20260923 }) {
  const soft = gaussian(Float32Array.from(raw), w, h, num('practicelightsoft', 1.5));
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const noise = gaussian(Float32Array.from({ length: n }, () => rnd() - 0.5), w, h, 1.2);
  let sd = 0; for (const v of noise) sd += v * v; sd = Math.sqrt(sd / n) || 1;
  const wander = num('practicelightwander', 0.1);
  const m = Uint8Array.from(soft, (v, i) => (v + wander * noise[i] / sd * 0.5 > 0.5 ? 1 : 0));
  return removeSmall(m, w, h, Math.max(8, Math.round(num('practicelightmin', 0.0006) * n)));
}
